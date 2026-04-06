const fs = require('fs');
const path = require('path');
const pool = require('./pool');

async function runMigrations() {
  const client = await pool.connect();
  try {
    // Create migrations tracking table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename   VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    const migrationsDir = path.join(__dirname, 'migrations');
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const { rows } = await client.query(
        'SELECT filename FROM schema_migrations WHERE filename = $1',
        [file]
      );

      if (rows.length > 0) {
        console.log(`[migrate] Skipping ${file} (already applied)`);
        continue;
      }

      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      await client.query(sql);
      await client.query(
        'INSERT INTO schema_migrations (filename) VALUES ($1)',
        [file]
      );
      console.log(`[migrate] Applied ${file}`);
    }
  } finally {
    client.release();
  }
}

module.exports = runMigrations;
