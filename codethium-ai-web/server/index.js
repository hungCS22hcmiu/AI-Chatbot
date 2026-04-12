const config = require('./config');
const app = require('./app');
const runMigrations = require('./db/migrate');

runMigrations()
  .then(() => {
    app.listen(config.PORT, () => {
      console.log(`Server running on http://localhost:${config.PORT}`);
    });
  })
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
