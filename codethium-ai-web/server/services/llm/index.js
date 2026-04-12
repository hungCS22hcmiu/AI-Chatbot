const config = require('../../config');
const OpenRouterProvider = require('./OpenRouterProvider');
const GroqProvider = require('./GroqProvider');
const LocalModelProvider = require('./LocalModelProvider');
const GeminiProvider = require('./GeminiProvider');
const GemmaProvider = require('./GemmaProvider');

function getProvider(name) {
  switch (name || config.LLM_PROVIDER) {
    case 'openrouter': return new OpenRouterProvider();
    case 'groq':       return new GroqProvider();
    case 'local':      return new LocalModelProvider();
    case 'gemini':     return new GeminiProvider();
    case 'gemma':      return new GemmaProvider();
    default: throw new Error(`Unknown LLM provider: "${name}"`);
  }
}

module.exports = { getProvider };
