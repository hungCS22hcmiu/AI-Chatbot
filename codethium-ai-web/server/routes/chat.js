const express = require('express');
const { z } = require('zod');
const pool = require('../db/pool');
const authMiddleware = require('../middleware/auth');
const { getProvider } = require('../services/llm');

const router = express.Router();

const streamSchema = z.object({
  chatId: z.number().int().positive(),
  content: z.string().min(1),
  model: z.enum(['openrouter', 'groq', 'local']).optional(),
});

// POST /api/chats/stream
router.post('/stream', authMiddleware, async (req, res) => {
  const parsed = streamSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors[0].message });
  }
  const { chatId, content, model } = parsed.data;

  try {
    // Verify chat belongs to user
    const chatResult = await pool.query(
      'SELECT id FROM chats WHERE id = $1 AND user_id = $2',
      [chatId, req.userId]
    );
    if (chatResult.rowCount === 0) {
      return res.status(404).json({ error: 'Chat not found' });
    }

    // Save user message
    await pool.query(
      'INSERT INTO messages (chat_id, role, content) VALUES ($1, $2, $3)',
      [chatId, 'user', content]
    );

    // Load last 20 messages as LLM context
    const historyResult = await pool.query(
      'SELECT role, content FROM messages WHERE chat_id = $1 ORDER BY created_at ASC LIMIT 20',
      [chatId]
    );
    const messages = historyResult.rows;

    const provider = getProvider(model);

    // SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    let fullResponse = '';

    for await (const chunk of provider.chatStream(messages)) {
      fullResponse += chunk;
      res.write(`event: token\ndata: ${JSON.stringify({ content: chunk })}\n\n`);
    }

    // Save assistant message
    const saved = await pool.query(
      `INSERT INTO messages (chat_id, role, content, metadata)
       VALUES ($1, 'assistant', $2, $3) RETURNING id`,
      [chatId, fullResponse, JSON.stringify({ provider: model || 'default', model: provider.getModelName() })]
    );

    res.write(`event: done\ndata: ${JSON.stringify({ messageId: saved.rows[0].id, model: provider.getModelName() })}\n\n`);
    res.end();
  } catch (err) {
    console.error('Stream error:', err);
    if (!res.headersSent) {
      return res.status(500).json({ error: 'Streaming failed' });
    }
    res.write(`event: error\ndata: ${JSON.stringify({ error: err.message })}\n\n`);
    res.end();
  }
});

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
