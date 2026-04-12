const GeminiProvider = require('./GeminiProvider');
const config = require('../../config');

class GemmaProvider extends GeminiProvider {
  constructor() {
    super();
    this.model = config.gemmaModel;
  }

  getModelName() { return this.model; }

  async *_filterThoughts(stream) {
    let buffer = '';
    let inThought = false;

    for await (const chunk of stream) {
      buffer += chunk;

      if (inThought) {
        const end = buffer.indexOf('</thought>');
        if (end !== -1) {
          buffer = buffer.slice(end + '</thought>'.length).trimStart();
          inThought = false;
          if (buffer) { yield buffer; buffer = ''; }
        }
        // still inside thought — keep buffering, yield nothing
      } else {
        const start = buffer.indexOf('<thought>');
        if (start === -1) {
          yield buffer; buffer = '';
        } else {
          if (start > 0) { yield buffer.slice(0, start); }
          buffer = buffer.slice(start);
          inThought = true;
          const end = buffer.indexOf('</thought>');
          if (end !== -1) {
            buffer = buffer.slice(end + '</thought>'.length).trimStart();
            inThought = false;
            if (buffer) { yield buffer; buffer = ''; }
          }
        }
      }
    }

    if (buffer && !inThought) yield buffer;
  }

  async *chatStream(messages) {
    yield* this._filterThoughts(super.chatStream(messages));
  }

  async *chatStreamMultimodal(historyMessages, attachments, userText) {
    yield* this._filterThoughts(
      super.chatStreamMultimodal(historyMessages, attachments, userText)
    );
  }
}

module.exports = GemmaProvider;
