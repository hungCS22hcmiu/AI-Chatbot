const OpenAICompatibleProvider = require('./OpenAICompatibleProvider');
const config = require('../../config');

const VISION_MODEL = 'meta-llama/llama-3.2-11b-vision-instruct:free';

class OpenRouterProvider extends OpenAICompatibleProvider {
  constructor() {
    super({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: config.OPENROUTER_API_KEY,
      model: config.OPENROUTER_MODEL,
      extraHeaders: { 'HTTP-Referer': 'http://localhost:3000' },
    });
  }

  /**
   * Stream a multimodal (image + text) request using the vision model.
   * @param {Array} historyMessages - prior [{role, content: string}] messages (no images)
   * @param {string} imageDataUrl - 'data:image/jpeg;base64,...'
   * @param {string} userText - the user's text for this turn (may include file context prefix)
   */
  async *chatStreamMultimodal(historyMessages, imageDataUrl, userText) {
    const messages = [
      ...historyMessages,
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: imageDataUrl } },
          { type: 'text', text: userText },
        ],
      },
    ];

    const res = await fetch(`${this.baseURL}/chat/completions`, {
      method: 'POST',
      headers: this._headers(),
      body: JSON.stringify({ model: VISION_MODEL, messages, stream: true }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`LLM API error ${res.status}: ${text}`);
    }

    yield* this._readSSEStream(res);
  }

  getVisionModelName() {
    return VISION_MODEL;
  }
}

module.exports = OpenRouterProvider;
