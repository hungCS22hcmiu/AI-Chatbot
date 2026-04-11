const config = require('../../config');
const OpenRouterProvider = require('./OpenRouterProvider');
const GroqProvider = require('./GroqProvider');
const LocalModelProvider = require('./LocalModelProvider');
const GeminiProvider = require('./GeminiProvider');

function getProvider(name) {
  switch (name || config.LLM_PROVIDER) {
    case 'openrouter': return new OpenRouterProvider();
    case 'groq':       return new GroqProvider();
    case 'local':      return new LocalModelProvider();
    case 'gemini':     return new GeminiProvider();
    default: throw new Error(`Unknown LLM provider: "${name}"`);
  }
}

module.exports = { getProvider };
