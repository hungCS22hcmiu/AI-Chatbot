const config = require('./config');
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');
const helmet = require('helmet');

const authRoutes = require('./routes/auth');
const chatRoutes = require('./routes/chat');
const uploadRoutes = require('./routes/upload');
const errorHandler = require('./middleware/errorHandler');

const app = express();

app.use(helmet());
if (config.NODE_ENV !== 'test') app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());
app.use(cors({
  origin: config.CORS_ORIGIN.split(','),
  credentials: true,
}));

app.use('/api', authRoutes);
app.use('/api/chats', chatRoutes);
app.use('/api/upload', uploadRoutes);

app.use(errorHandler);

module.exports = app;
