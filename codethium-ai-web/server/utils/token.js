const jwt = require('jsonwebtoken');
const config = require('../config');

function signToken(userId) {
  return jwt.sign({ userId }, config.JWT_SECRET, { expiresIn: '7d' });
}

module.exports = { signToken };
