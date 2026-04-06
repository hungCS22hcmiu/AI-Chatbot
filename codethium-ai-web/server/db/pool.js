const { Pool } = require('pg');
const config = require('../config');

const pool = new Pool({
  host: config.DB_HOST,
  port: config.DB_PORT,
  user: config.DB_USER,
  password: config.DB_PASSWORD,
  database: config.DB_NAME,
});

pool.connect((err) => {
  if (err) console.error('DB connection error:', err);
  else console.log('Connected to PostgreSQL database');
});

module.exports = pool;
