const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const config = require('../config');

/** Short-lived access token (15 minutes). */
function signAccessToken(userId) {
  return jwt.sign({ userId }, config.JWT_SECRET, { expiresIn: '15m' });
}

/** Opaque random refresh token — store its hash in the DB. */
function signRefreshToken() {
  return crypto.randomBytes(64).toString('hex');
}

/** SHA-256 hash for safe DB storage. */
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

module.exports = { signAccessToken, signRefreshToken, hashToken };
