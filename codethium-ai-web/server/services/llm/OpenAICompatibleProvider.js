const BaseLLMProvider = require('./BaseLLMProvider');

class OpenAICompatibleProvider extends BaseLLMProvider {
  constructor({ baseURL, apiKey, model, extraHeaders = {} }) {
    super();
    this.baseURL = baseURL;
    this.apiKey = apiKey;
    this.model = model;
    this.extraHeaders = extraHeaders;
  }

  getModelName() {
    return this.model;
  }

  _headers() {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.apiKey}`,
      ...this.extraHeaders,
    };
  }

  async chat(messages) {
    const res = await fetch(`${this.baseURL}/chat/completions`, {
      method: 'POST',
      headers: this._headers(),
      body: JSON.stringify({ model: this.model, messages, stream: false }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`LLM API error ${res.status}: ${text}`);
    }
    const data = await res.json();
    return data.choices[0].message.content;
  }

  async *chatStream(messages) {
    const res = await fetch(`${this.baseURL}/chat/completions`, {
      method: 'POST',
      headers: this._headers(),
      body: JSON.stringify({ model: this.model, messages, stream: true }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`LLM API error ${res.status}: ${text}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // keep incomplete line

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === '[DONE]') return;
        try {
          const json = JSON.parse(payload);
          const content = json.choices?.[0]?.delta?.content;
          if (content) yield content;
        } catch {
          // ignore malformed lines
        }
      }
    }
  }
}

module.exports = OpenAICompatibleProvider;
