const request = require('supertest');
const app = require('../app');
const pool = require('../db/pool');
const { signAccessToken } = require('../utils/token');

jest.mock('../db/pool');
jest.mock('../services/rag', () => ({
  searchDocuments: jest.fn().mockResolvedValue([]),
  storeDocument: jest.fn().mockResolvedValue(1),
}));
jest.mock('../services/llm', () => ({
  getProvider: jest.fn(),
}));

const { getProvider } = require('../services/llm');

function makeToken(userId = 1) {
  return signAccessToken(userId);
}

describe('GET /api/chats', () => {
  beforeEach(() => jest.clearAllMocks());

  test('200 — returns chats for authenticated user', async () => {
    pool.query.mockResolvedValue({
      rows: [
        { id: 1, title: 'First chat', message: '[]', created_at: new Date().toISOString() },
      ],
    });

    const res = await request(app)
      .get('/api/chats')
      .set('Cookie', `token=${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.chats).toHaveLength(1);
  });

  test('401 — rejects unauthenticated request', async () => {
    const res = await request(app).get('/api/chats');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/chats', () => {
  beforeEach(() => jest.clearAllMocks());

  test('200 — creates a new chat', async () => {
    pool.query.mockResolvedValue({
      rows: [{ id: 5, title: 'New chat', user_id: 1, message: '[]', created_at: new Date().toISOString() }],
    });

    const res = await request(app)
      .post('/api/chats')
      .set('Cookie', `token=${makeToken()}`)
      .send({ title: 'New chat', messages: [] });

    expect(res.status).toBe(200);
    expect(res.body.chat.id).toBe(5);
  });
});

describe('DELETE /api/chats/:id', () => {
  beforeEach(() => jest.clearAllMocks());

  test('200 — deletes own chat', async () => {
    pool.query.mockResolvedValue({ rowCount: 1 });

    const res = await request(app)
      .delete('/api/chats/1')
      .set('Cookie', `token=${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Chat deleted');
  });
});

describe('POST /api/chats/stream', () => {
  beforeEach(() => jest.clearAllMocks());

  test('400 — missing chatId', async () => {
    const res = await request(app)
      .post('/api/chats/stream')
      .set('Cookie', `token=${makeToken()}`)
      .send({ content: 'Hello' });

    expect(res.status).toBe(400);
  });

  test('400 — content exceeds 10000 chars', async () => {
    const res = await request(app)
      .post('/api/chats/stream')
      .set('Cookie', `token=${makeToken()}`)
      .send({ chatId: 1, content: 'x'.repeat(10001) });

    expect(res.status).toBe(400);
  });

  test('404 — chat not found or belongs to other user', async () => {
    pool.query.mockResolvedValueOnce({ rowCount: 0 }); // chat ownership check fails

    const res = await request(app)
      .post('/api/chats/stream')
      .set('Cookie', `token=${makeToken()}`)
      .send({ chatId: 999, content: 'Hello' });

    expect(res.status).toBe(404);
  });

  test('SSE — streams tokens and sends done event', async () => {
    // chat ownership check, save user msg, load history
    pool.query
      .mockResolvedValueOnce({ rowCount: 1 })          // chat ownership check
      .mockResolvedValueOnce({ rows: [] })              // INSERT user message
      .mockResolvedValueOnce({ rows: [{ role: 'user', content: 'Hello' }] }) // load history
      .mockResolvedValueOnce({ rows: [{ id: 42 }] });  // INSERT assistant message

    async function* fakeStream() {
      yield 'Hello';
      yield ' world';
    }

    getProvider.mockReturnValue({
      chatStream: () => fakeStream(),
      getModelName: () => 'test-model',
    });

    const res = await request(app)
      .post('/api/chats/stream')
      .set('Cookie', `token=${makeToken()}`)
      .send({ chatId: 1, content: 'Hello' });

    // SSE response should have correct content type
    expect(res.headers['content-type']).toMatch(/text\/event-stream/);
    expect(res.text).toContain('event: token');
    expect(res.text).toContain('Hello');
    expect(res.text).toContain('event: done');
  });

  test('401 — unauthenticated', async () => {
    const res = await request(app)
      .post('/api/chats/stream')
      .send({ chatId: 1, content: 'Hello' });

    expect(res.status).toBe(401);
  });
});
