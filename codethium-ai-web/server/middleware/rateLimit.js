const rateLimit = require('express-rate-limit');

// 15 req/min per IP — for login & register
const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, try again later' },
});

// 60 req/min per user — for chat streaming (applied after authMiddleware)
const streamLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.userId,
  message: { error: 'Too many requests, try again later' },
});

// 30 req/min per user — for file uploads (Phase 5)
const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.userId,
  message: { error: 'Too many requests, try again later' },
});

module.exports = { authLimiter, streamLimiter, uploadLimiter };
