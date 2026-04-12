const BaseLLMProvider = require('./BaseLLMProvider');
const config = require('../../config');
const formatLocalResponse = require('../formatLocalResponse');

class LocalModelProvider extends BaseLLMProvider {
  getModelName() {
    return 'codethium-local';
  }

  async chat(messages) {
    const chunks = [];
    for await (const chunk of this.chatStream(messages)) {
      chunks.push(chunk);
    }
    return chunks.join('');
  }

  async *chatStream(messages) {
    // Local model takes a single string — use the last user message
    const lastUser = [...messages].reverse().find(m => m.role === 'user');
    const message = lastUser?.content || '';

    const res = await fetch(`${config.LOCAL_MODEL_URL}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Local model error ${res.status}: ${text}`);
    }
    const data = await res.json();
    yield formatLocalResponse(data.reply);
  }
}

module.exports = LocalModelProvider;
