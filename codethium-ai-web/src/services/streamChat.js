const BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:4000';

/**
 * Stream a chat message via SSE.
 * @param {object} opts
 * @param {number} opts.chatId
 * @param {string} opts.content
 * @param {string} [opts.model] - 'openrouter' | 'groq' | 'local'
 * @param {function} opts.onToken - called with each string chunk
 * @param {function} opts.onDone  - called with { messageId, model }
 * @param {function} opts.onError - called with error message string
 * @returns {AbortController} - call .abort() to cancel
 */
export function streamChat({ chatId, content, model, onToken, onDone, onError }) {
  const controller = new AbortController();

  (async () => {
    try {
      const res = await fetch(`${BASE_URL}/api/chats/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ chatId, content, model }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text();
        onError(text || `HTTP ${res.status}`);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split('\n\n');
        buffer = frames.pop(); // keep incomplete frame

        for (const frame of frames) {
          const lines = frame.split('\n');
          let eventType = '';
          let data = '';

          for (const line of lines) {
            if (line.startsWith('event:')) eventType = line.slice(6).trim();
            if (line.startsWith('data:')) data = line.slice(5).trim();
          }

          if (!data) continue;

          try {
            const parsed = JSON.parse(data);
            if (eventType === 'token') onToken(parsed.content);
            else if (eventType === 'done') onDone(parsed);
            else if (eventType === 'error') onError(parsed.error);
          } catch {
            // ignore malformed frame
          }
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') onError(err.message);
    }
  })();

  return controller;
}
