class BaseLLMProvider {
  // messages: [{role: 'user'|'assistant'|'system', content: string}]
  async chat(messages) {
    throw new Error('Not implemented');
  }

  // Async generator — yields string chunks
  async *chatStream(messages) {
    throw new Error('Not implemented');
  }

  getModelName() {
    throw new Error('Not implemented');
  }
}

module.exports = BaseLLMProvider;
