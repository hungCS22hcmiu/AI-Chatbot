const OpenAICompatibleProvider = require('./OpenAICompatibleProvider');
const config = require('../../config');

class OpenRouterProvider extends OpenAICompatibleProvider {
  constructor() {
    super({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: config.OPENROUTER_API_KEY,
      model: config.OPENROUTER_MODEL,
      extraHeaders: { 'HTTP-Referer': 'http://localhost:3000' },
    });
  }
}

module.exports = OpenRouterProvider;
