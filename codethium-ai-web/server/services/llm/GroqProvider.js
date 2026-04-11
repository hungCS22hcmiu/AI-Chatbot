const OpenAICompatibleProvider = require('./OpenAICompatibleProvider');
const config = require('../../config');

class GroqProvider extends OpenAICompatibleProvider {
  constructor() {
    super({
      baseURL: 'https://api.groq.com/openai/v1',
      apiKey: config.GROQ_API_KEY,
      model: config.GROQ_MODEL,
    });
  }
}

module.exports = GroqProvider;
