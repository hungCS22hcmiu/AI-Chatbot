const { getProvider } = require('../services/llm');
const OpenRouterProvider = require('../services/llm/OpenRouterProvider');
const GroqProvider = require('../services/llm/GroqProvider');
const LocalModelProvider = require('../services/llm/LocalModelProvider');
const GeminiProvider = require('../services/llm/GeminiProvider');
const OpenAICompatibleProvider = require('../services/llm/OpenAICompatibleProvider');

// ── Provider factory ───────────────────────────────────────────────────────

describe('getProvider factory', () => {
  test('returns OpenRouterProvider for "openrouter"', () => {
    expect(getProvider('openrouter')).toBeInstanceOf(OpenRouterProvider);
  });

  test('returns GroqProvider for "groq"', () => {
    expect(getProvider('groq')).toBeInstanceOf(GroqProvider);
  });

  test('returns LocalModelProvider for "local"', () => {
    expect(getProvider('local')).toBeInstanceOf(LocalModelProvider);
  });

  test('returns GeminiProvider for "gemini"', () => {
    expect(getProvider('gemini')).toBeInstanceOf(GeminiProvider);
  });

  test('throws for unknown provider name', () => {
    expect(() => getProvider('unknown')).toThrow(/Unknown LLM provider/);
  });
});

// ── getModelName ───────────────────────────────────────────────────────────

describe('getModelName()', () => {
  test('OpenRouterProvider returns a model string', () => {
    const p = getProvider('openrouter');
    expect(typeof p.getModelName()).toBe('string');
    expect(p.getModelName().length).toBeGreaterThan(0);
  });

  test('GroqProvider returns a model string', () => {
    const p = getProvider('groq');
    expect(typeof p.getModelName()).toBe('string');
  });

  test('GeminiProvider returns a model string', () => {
    const p = getProvider('gemini');
    expect(typeof p.getModelName()).toBe('string');
  });
});

// ── SSE stream parsing ─────────────────────────────────────────────────────

/**
 * Build a mock ReadableStream-like body from a list of SSE line strings.
 * Each element is sent as one chunk (with trailing newline).
 */
function makeSseBody(lines) {
  const encoder = new TextEncoder();
  const chunks = lines.map(l => encoder.encode(l + '\n'));
  let index = 0;
  return {
    getReader: () => ({
      async read() {
        if (index >= chunks.length) return { done: true, value: undefined };
        return { done: false, value: chunks[index++] };
      },
    }),
  };
}

describe('OpenAICompatibleProvider._readSSEStream()', () => {
  afterEach(() => {
    if (global.fetch && global.fetch.mockRestore) global.fetch.mockRestore();
    jest.restoreAllMocks();
  });

  test('yields content chunks and stops at [DONE]', async () => {
    const sseLines = [
      'data: {"choices":[{"delta":{"content":"Hello"}}]}',
      'data: {"choices":[{"delta":{"content":" world"}}]}',
      'data: [DONE]',
    ];

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      body: makeSseBody(sseLines),
    });

    const provider = new OpenAICompatibleProvider({
      baseURL: 'https://example.com/v1',
      apiKey: 'test',
      model: 'test-model',
    });

    const chunks = [];
    for await (const chunk of provider.chatStream([{ role: 'user', content: 'hi' }])) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual(['Hello', ' world']);
  });

  test('throws on non-200 response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
    });

    const provider = new OpenAICompatibleProvider({
      baseURL: 'https://example.com/v1',
      apiKey: 'bad-key',
      model: 'test-model',
    });

    await expect(async () => {
      for await (const _ of provider.chatStream([{ role: 'user', content: 'hi' }])) {
        // consume
      }
    }).rejects.toThrow(/401/);
  });

  test('skips malformed data lines without throwing', async () => {
    const sseLines = [
      'data: {"choices":[{"delta":{"content":"OK"}}]}',
      'data: not-valid-json{{{{',
      'data: [DONE]',
    ];

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      body: makeSseBody(sseLines),
    });

    const provider = new OpenAICompatibleProvider({
      baseURL: 'https://example.com/v1',
      apiKey: 'test',
      model: 'test-model',
    });

    const chunks = [];
    for await (const chunk of provider.chatStream([{ role: 'user', content: 'hi' }])) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual(['OK']);
  });
});
