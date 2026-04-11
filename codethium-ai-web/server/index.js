const config = require('./config');
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');
const helmet = require('helmet');

const runMigrations = require('./db/migrate');
const authRoutes = require('./routes/auth');
const chatRoutes = require('./routes/chat');
const uploadRoutes = require('./routes/upload');
const errorHandler = require('./middleware/errorHandler');

const app = express();

app.use(helmet());
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());
app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true,
}));

app.use('/api', authRoutes);
app.use('/api/chats', chatRoutes);
app.use('/api/upload', uploadRoutes);

app.use(errorHandler);

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
