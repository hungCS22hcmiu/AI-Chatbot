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
 * @param {function} [opts.onAuthError] - called when token refresh fails (session truly expired)
 * @returns {AbortController} - call .abort() to cancel
 */
export function streamChat({ chatId, content, model, attachments, onToken, onDone, onError, onAuthError }) {
  const controller = new AbortController();

  (async () => {
    const doStream = async (retried) => {
      try {
        const res = await fetch(`${BASE_URL}/api/chats/stream`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ chatId, content, model, attachments }),
          signal: controller.signal,
        });

        if (!res.ok) {
          if (res.status === 401 && !retried) {
            // Access token expired — try to refresh silently then retry stream
            try {
              const refreshRes = await fetch(`${BASE_URL}/api/refresh`, {
                method: 'POST',
                credentials: 'include',
              });
              if (refreshRes.ok) {
                return doStream(true);
              }
            } catch { /* network error during refresh */ }
            // Refresh also failed — session is truly expired
            if (onAuthError) onAuthError();
            return;
          }
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
    };

    await doStream(false);
  })();

  return controller;
}
