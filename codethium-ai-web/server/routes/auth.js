const express = require('express');
const bcrypt = require('bcrypt');
const { z } = require('zod');
const pool = require('../db/pool');
const { signAccessToken, signRefreshToken, hashToken } = require('../utils/token');
const authMiddleware = require('../middleware/auth');
const config = require('../config');
const { authLimiter } = require('../middleware/rateLimit');

const router = express.Router();

// ── Zod schemas ────────────────────────────────────────────────────────────

const passwordSchema = z.string()
  .min(12, 'Password must be at least 12 characters')
  .regex(/[A-Z]/, 'Password must include an uppercase letter')
  .regex(/[a-z]/, 'Password must include a lowercase letter')
  .regex(/[0-9]/, 'Password must include a number')
  .regex(/[^A-Za-z0-9]/, 'Password must include a special character');

const registerSchema = z.object({
  username: z.string()
    .min(3, 'Username must be at least 3 characters')
    .max(30, 'Username must be at most 30 characters')
    .regex(/^[a-zA-Z0-9_]+$/, 'Username may only contain letters, numbers, and underscores'),
  email: z.string().email('Invalid email address'),
  password: passwordSchema,
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: passwordSchema,
});

// ── Cookie helpers ─────────────────────────────────────────────────────────

const ACCESS_TOKEN_MAX_AGE  = 15 * 60 * 1000;         // 15 minutes
const REFRESH_TOKEN_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days

function setAccessCookie(res, token) {
  res.cookie('token', token, {
    httpOnly: true,
    secure: config.NODE_ENV === 'production',
    maxAge: ACCESS_TOKEN_MAX_AGE,
    sameSite: 'lax',
  });
}

function setRefreshCookie(res, token) {
  res.cookie('refresh_token', token, {
    httpOnly: true,
    secure: config.NODE_ENV === 'production',
    maxAge: REFRESH_TOKEN_MAX_AGE,
    sameSite: 'lax',
  });
}

// ── Routes ─────────────────────────────────────────────────────────────────

// POST /api/register
router.post('/register', authLimiter, async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors[0].message });
  }
  const { username, email, password } = parsed.data;

  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (username, email, password_hash)
       VALUES ($1, LOWER($2), $3)
       RETURNING id, username, email, created_at`,
      [username.toLowerCase(), email.toLowerCase(), passwordHash]
    );
    return res.status(201).json({ user: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Email or username already exists' });
    }
    console.error('Register error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/login
router.post('/login', authLimiter, async (req, res) => {
  const { username, email, password } = req.body;
  if (!password || (!username && !email)) {
    return res.status(400).json({ error: 'Missing username/email or password' });
  }

  try {
    const result = await pool.query(
      `SELECT id, username, email, password_hash
       FROM users
       WHERE LOWER(email) = LOWER($1) OR LOWER(username) = LOWER($2)`,
      [email || '', username || '']
    );

    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: 'Invalid credentials' });

    // Issue access token (short-lived)
    const accessToken = signAccessToken(user.id);
    setAccessCookie(res, accessToken);

    // Issue refresh token (long-lived, stored hashed in DB)
    const rawRefresh = signRefreshToken();
    const refreshHash = hashToken(rawRefresh);
    const refreshExpiry = new Date(Date.now() + REFRESH_TOKEN_MAX_AGE);
    await pool.query(
      'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
      [user.id, refreshHash, refreshExpiry]
    );
    setRefreshCookie(res, rawRefresh);

    return res.json({ user: { id: user.id, username: user.username, email: user.email } });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/refresh — issue new access token from refresh token cookie
router.post('/refresh', async (req, res) => {
  const rawToken = req.cookies.refresh_token;
  if (!rawToken) return res.status(401).json({ error: 'No refresh token' });

  try {
    const tokenHash = hashToken(rawToken);
    const result = await pool.query(
      'SELECT id, user_id, expires_at FROM refresh_tokens WHERE token_hash = $1',
      [tokenHash]
    );

    const record = result.rows[0];
    if (!record) return res.status(401).json({ error: 'Invalid refresh token' });

    if (new Date(record.expires_at) < new Date()) {
      await pool.query('DELETE FROM refresh_tokens WHERE id = $1', [record.id]);
      return res.status(401).json({ error: 'Refresh token expired' });
    }

    const accessToken = signAccessToken(record.user_id);
    setAccessCookie(res, accessToken);

    return res.json({ message: 'Token refreshed' });
  } catch (err) {
    console.error('Refresh error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/me
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, username, email, created_at FROM users WHERE id = $1',
      [req.userId]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'User not found' });
    return res.json({ user: result.rows[0] });
  } catch (err) {
    console.error('Get user error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/logout
router.post('/logout', async (req, res) => {
  const rawToken = req.cookies.refresh_token;
  if (rawToken) {
    try {
      const tokenHash = hashToken(rawToken);
      await pool.query('DELETE FROM refresh_tokens WHERE token_hash = $1', [tokenHash]);
    } catch (err) {
      console.error('Logout cleanup error:', err);
    }
  }
  res.clearCookie('token');
  res.clearCookie('refresh_token');
  res.json({ message: 'Logged out' });
});

// POST /api/change-password
router.post('/change-password', authMiddleware, async (req, res) => {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors[0].message });
  }
  const { currentPassword, newPassword } = parsed.data;

  try {
    const result = await pool.query(
      'SELECT id, password_hash FROM users WHERE id = $1',
      [req.userId]
    );
    const user = result.rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });

    const match = await bcrypt.compare(currentPassword, user.password_hash);
    if (!match) return res.status(401).json({ error: 'Current password is incorrect' });

    const newPasswordHash = await bcrypt.hash(newPassword, 10);
    await pool.query(
      'UPDATE users SET password_hash = $1 WHERE id = $2',
      [newPasswordHash, user.id]
    );

    return res.json({ message: 'Password changed successfully' });
  } catch (err) {
    console.error('Change password error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
