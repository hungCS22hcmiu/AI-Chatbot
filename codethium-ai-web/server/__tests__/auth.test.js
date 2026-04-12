const request = require('supertest');
const app = require('../app');
const pool = require('../db/pool');
const bcrypt = require('bcrypt');
const { signAccessToken, hashToken } = require('../utils/token');

jest.mock('../db/pool');
jest.mock('bcrypt');

// auth routes don't use rag, but rag is imported by chat.js
// (not needed here, but include to prevent accidental side effects)

describe('POST /api/register', () => {
  beforeEach(() => jest.clearAllMocks());

  test('201 — creates user with valid data', async () => {
    bcrypt.hash.mockResolvedValue('$hashed');
    pool.query.mockResolvedValue({
      rows: [{ id: 1, username: 'testuser', email: 'test@example.com', created_at: new Date().toISOString() }],
    });

    const res = await request(app)
      .post('/api/register')
      .send({ username: 'testuser', email: 'test@example.com', password: 'ValidPass123!' });

    expect(res.status).toBe(201);
    expect(res.body.user.username).toBe('testuser');
  });

  test('400 — rejects password under 12 chars', async () => {
    const res = await request(app)
      .post('/api/register')
      .send({ username: 'testuser', email: 'test@example.com', password: 'Short1!' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/12 characters/);
  });

  test('400 — rejects password without uppercase', async () => {
    const res = await request(app)
      .post('/api/register')
      .send({ username: 'testuser', email: 'test@example.com', password: 'nouppercase123!' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/uppercase/i);
  });

  test('400 — rejects password without special character', async () => {
    const res = await request(app)
      .post('/api/register')
      .send({ username: 'testuser', email: 'test@example.com', password: 'NoSpecialChar123' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/special character/i);
  });

  test('400 — rejects invalid email', async () => {
    const res = await request(app)
      .post('/api/register')
      .send({ username: 'testuser', email: 'not-an-email', password: 'ValidPass123!' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/email/i);
  });

  test('400 — rejects username with invalid characters', async () => {
    const res = await request(app)
      .post('/api/register')
      .send({ username: 'bad user!', email: 'test@example.com', password: 'ValidPass123!' });

    expect(res.status).toBe(400);
  });

  test('409 — rejects duplicate email/username', async () => {
    bcrypt.hash.mockResolvedValue('$hashed');
    const dbErr = new Error('duplicate');
    dbErr.code = '23505';
    pool.query.mockRejectedValue(dbErr);

    const res = await request(app)
      .post('/api/register')
      .send({ username: 'existing', email: 'taken@example.com', password: 'ValidPass123!' });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already exists/);
  });
});

describe('POST /api/login', () => {
  beforeEach(() => jest.clearAllMocks());

  test('200 — sets access + refresh cookies on valid credentials', async () => {
    pool.query
      .mockResolvedValueOnce({ // SELECT user
        rows: [{ id: 1, username: 'testuser', email: 'test@example.com', password_hash: '$hashed' }],
      })
      .mockResolvedValueOnce({ rows: [] }); // INSERT refresh token
    bcrypt.compare.mockResolvedValue(true);

    const res = await request(app)
      .post('/api/login')
      .send({ username: 'testuser', password: 'ValidPass123!' });

    expect(res.status).toBe(200);
    expect(res.body.user.username).toBe('testuser');
    const cookies = res.headers['set-cookie'] || [];
    expect(cookies.some(c => c.startsWith('token='))).toBe(true);
    expect(cookies.some(c => c.startsWith('refresh_token='))).toBe(true);
  });

  test('401 — wrong password', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{ id: 1, username: 'testuser', email: 'test@example.com', password_hash: '$hashed' }],
    });
    bcrypt.compare.mockResolvedValue(false);

    const res = await request(app)
      .post('/api/login')
      .send({ username: 'testuser', password: 'WrongPass123!' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid credentials');
  });

  test('401 — unknown user', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post('/api/login')
      .send({ username: 'nobody', password: 'ValidPass123!' });

    expect(res.status).toBe(401);
  });

  test('400 — missing password', async () => {
    const res = await request(app)
      .post('/api/login')
      .send({ username: 'testuser' });

    expect(res.status).toBe(400);
  });
});

describe('GET /api/me', () => {
  beforeEach(() => jest.clearAllMocks());

  test('200 — returns user for valid token', async () => {
    pool.query.mockResolvedValue({
      rows: [{ id: 1, username: 'testuser', email: 'test@example.com', created_at: new Date().toISOString() }],
    });
    const token = signAccessToken(1);

    const res = await request(app)
      .get('/api/me')
      .set('Cookie', `token=${token}`);

    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(1);
  });

  test('401 — no token', async () => {
    const res = await request(app).get('/api/me');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/refresh', () => {
  beforeEach(() => jest.clearAllMocks());

  test('200 — issues new access token for valid refresh token', async () => {
    const rawToken = 'a'.repeat(128);
    const hash = hashToken(rawToken);
    pool.query.mockResolvedValueOnce({
      rows: [{
        id: 1,
        user_id: 42,
        expires_at: new Date(Date.now() + 60000).toISOString(),
      }],
    });

    const res = await request(app)
      .post('/api/refresh')
      .set('Cookie', `refresh_token=${rawToken}`);

    expect(res.status).toBe(200);
    const cookies = res.headers['set-cookie'] || [];
    expect(cookies.some(c => c.startsWith('token='))).toBe(true);
  });

  test('401 — no refresh token cookie', async () => {
    const res = await request(app).post('/api/refresh');
    expect(res.status).toBe(401);
  });

  test('401 — unknown refresh token', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post('/api/refresh')
      .set('Cookie', 'refresh_token=unknowntoken');

    expect(res.status).toBe(401);
  });

  test('401 — expired refresh token', async () => {
    pool.query
      .mockResolvedValueOnce({
        rows: [{
          id: 5,
          user_id: 42,
          expires_at: new Date(Date.now() - 1000).toISOString(), // past
        }],
      })
      .mockResolvedValueOnce({ rows: [] }); // DELETE

    const res = await request(app)
      .post('/api/refresh')
      .set('Cookie', 'refresh_token=expiredtoken');

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/expired/i);
  });
});

describe('POST /api/logout', () => {
  beforeEach(() => jest.clearAllMocks());

  test('200 — clears cookies', async () => {
    pool.query.mockResolvedValue({ rows: [] });

    const res = await request(app)
      .post('/api/logout')
      .set('Cookie', 'refresh_token=sometoken');

    expect(res.status).toBe(200);
    const cookies = res.headers['set-cookie'] || [];
    // Both cookies should be cleared (set with past expiry)
    expect(cookies.some(c => c.includes('token=;') || c.includes('Expires=Thu, 01 Jan 1970'))).toBe(true);
  });
});

describe('POST /api/change-password', () => {
  beforeEach(() => jest.clearAllMocks());

  test('200 — updates password with valid data', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 1, password_hash: '$old' }] })
      .mockResolvedValueOnce({ rows: [] });
    bcrypt.compare.mockResolvedValue(true);
    bcrypt.hash.mockResolvedValue('$new');

    const token = signAccessToken(1);
    const res = await request(app)
      .post('/api/change-password')
      .set('Cookie', `token=${token}`)
      .send({ currentPassword: 'OldPass123!', newPassword: 'NewSecure456@' });

    expect(res.status).toBe(200);
  });

  test('400 — rejects weak new password', async () => {
    const token = signAccessToken(1);
    const res = await request(app)
      .post('/api/change-password')
      .set('Cookie', `token=${token}`)
      .send({ currentPassword: 'OldPass123!', newPassword: 'weak' });

    expect(res.status).toBe(400);
  });

  test('401 — wrong current password', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ id: 1, password_hash: '$old' }] });
    bcrypt.compare.mockResolvedValue(false);

    const token = signAccessToken(1);
    const res = await request(app)
      .post('/api/change-password')
      .set('Cookie', `token=${token}`)
      .send({ currentPassword: 'WrongPass123!', newPassword: 'NewSecure456@' });

    expect(res.status).toBe(401);
  });
});
