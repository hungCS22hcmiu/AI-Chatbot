const OpenAICompatibleProvider = require('./OpenAICompatibleProvider');
const config = require('../../config');

class GeminiProvider extends OpenAICompatibleProvider {
  constructor() {
    super({
      baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai',
      apiKey: config.GEMINI_API_KEY,
      model: config.GEMINI_MODEL,
    });
  }

  /**
   * Stream a multimodal request (images + PDFs + text) to Gemini.
   * @param {Array} historyMessages - prior [{role, content: string}] messages
   * @param {Array} attachments - [{type:'image'|'pdf', payload: dataUrl, name}]
   * @param {string} userText - the user's text prompt for this turn
   */
  async *chatStreamMultimodal(historyMessages, attachments, userText) {
    // Build content parts: text first, then each attachment as image_url
    // Gemini's OpenAI-compat endpoint accepts PDF data URLs via the image_url field
    const contentParts = [{ type: 'text', text: userText }];
    for (const att of attachments) {
      if (att.type === 'image' || att.type === 'pdf') {
        contentParts.push({ type: 'image_url', image_url: { url: att.payload } });
      }
    }

    const messages = [
      ...historyMessages,
      { role: 'user', content: contentParts },
    ];

    const res = await fetch(`${this.baseURL}/chat/completions`, {
      method: 'POST',
      headers: this._headers(),
      body: JSON.stringify({ model: this.model, messages, stream: true }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`LLM API error ${res.status}: ${text}`);
    }

    yield* this._readSSEStream(res);
  }
}

module.exports = GeminiProvider;
