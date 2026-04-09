const express = require('express');
const pool = require('../db/pool');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// POST /api/chats
router.post('/', authMiddleware, async (req, res) => {
  const { title, messages } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO chats (user_id, title, message)
       VALUES ($1, $2, $3) RETURNING *`,
      [req.userId, title, JSON.stringify(messages)]
    );
    return res.json({ chat: result.rows[0] });
  } catch (err) {
    console.error('Save chat error:', err);
    return res.status(500).json({ error: 'Failed to save chat' });
  }
});

// GET /api/chats
router.get('/', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, title, message, created_at FROM chats WHERE user_id = $1 ORDER BY updated_at DESC',
      [req.userId]
    );
    return res.json({ chats: result.rows });
  } catch (err) {
    console.error('Get chats error:', err);
    return res.status(500).json({ error: 'Failed to fetch chats' });
  }
});

// PUT /api/chats/:id
router.put('/:id', authMiddleware, async (req, res) => {
  const { messages } = req.body;
  try {
    const result = await pool.query(
      `UPDATE chats SET message = $1, updated_at = NOW()
       WHERE id = $2 AND user_id = $3 RETURNING *`,
      [JSON.stringify(messages), req.params.id, req.userId]
    );
    return res.json({ chat: result.rows[0] });
  } catch (err) {
    console.error('Update chat error:', err);
    return res.status(500).json({ error: 'Failed to update chat' });
  }
});

// DELETE /api/chats/:id
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM chats WHERE id = $1 AND user_id = $2',
      [req.params.id, req.userId]
    );
    return res.json({ message: 'Chat deleted' });
  } catch (err) {
    console.error('Delete chat error:', err);
    return res.status(500).json({ error: 'Failed to delete chat' });
  }
});

module.exports = router;
