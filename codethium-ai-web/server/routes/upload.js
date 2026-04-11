const express = require('express');
const multer = require('multer');
const authMiddleware = require('../middleware/auth');
const { uploadLimiter } = require('../middleware/rateLimit');
const { extractText } = require('../services/fileParser');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

// POST /api/upload/image
router.post('/image', authMiddleware, uploadLimiter, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  if (!req.file.mimetype.startsWith('image/'))
    return res.status(415).json({ error: 'File must be an image' });
  const base64 = req.file.buffer.toString('base64');
  const dataUrl = `data:${req.file.mimetype};base64,${base64}`;
  return res.json({ type: 'image', payload: dataUrl, name: req.file.originalname });
});

// POST /api/upload/file
router.post('/file', authMiddleware, uploadLimiter, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  try {
    const text = await extractText(req.file.buffer, req.file.mimetype);
    return res.json({ type: 'file', payload: text, name: req.file.originalname });
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
});

// Scoped multer error handler
router.use((err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE')
    return res.status(413).json({ error: 'File too large (max 5MB)' });
  next(err);
});

module.exports = router;
