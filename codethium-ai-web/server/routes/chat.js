const express = require('express');
const { z } = require('zod');
const pool = require('../db/pool');
const authMiddleware = require('../middleware/auth');
const { getProvider } = require('../services/llm');

const { streamLimiter } = require('../middleware/rateLimit');

const router = express.Router();

const attachmentSchema = z.object({
  type: z.enum(['image', 'file']),
  payload: z.string().min(1),
  name: z.string().min(1),
});

const streamSchema = z.object({
  chatId: z.number().int().positive(),
  content: z.string().min(1),
  model: z.enum(['openrouter', 'groq', 'local']).optional(),
  attachments: z.array(attachmentSchema).max(5).optional(),
});

// POST /api/chats/stream
router.post('/stream', authMiddleware, streamLimiter, async (req, res) => {
  const parsed = streamSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors[0].message });
  }
  const { chatId, content, model, attachments } = parsed.data;

  try {
    // Verify chat belongs to user
    const chatResult = await pool.query(
      'SELECT id FROM chats WHERE id = $1 AND user_id = $2',
      [chatId, req.userId]
    );
    if (chatResult.rowCount === 0) {
      return res.status(404).json({ error: 'Chat not found' });
    }

    // Save user message — store attachment name/type in metadata (not payload)
    const userMeta = attachments?.length
      ? JSON.stringify({ attachments: attachments.map(a => ({ type: a.type, name: a.name })) })
      : JSON.stringify({});
    await pool.query(
      'INSERT INTO messages (chat_id, role, content, metadata) VALUES ($1, $2, $3, $4)',
      [chatId, 'user', content, userMeta]
    );

    // Load last 20 messages as LLM context
    const historyResult = await pool.query(
      'SELECT role, content FROM messages WHERE chat_id = $1 ORDER BY created_at ASC LIMIT 20',
      [chatId]
    );
    const dbMessages = historyResult.rows;

    // Inject file text as context prefix for LLM (not stored in DB)
    const fileAttachments = attachments?.filter(a => a.type === 'file') || [];
    const imageAttachment = attachments?.find(a => a.type === 'image');
    let userContentForLLM = content;
    if (fileAttachments.length > 0) {
      const fileContext = fileAttachments
        .map(a => `[File: ${a.name}]\n${a.payload}`)
        .join('\n\n---\n\n');
      userContentForLLM = `${fileContext}\n\n---\n\nUser question: ${content}`;
    }

    // Build messages for LLM: override last user message with augmented content
    const messagesForLLM = dbMessages.map((msg, i) =>
      i === dbMessages.length - 1 && msg.role === 'user'
        ? { ...msg, content: userContentForLLM }
        : msg
    );

    // SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    // Try requested provider, fallback on 429
    const FALLBACK = { openrouter: 'groq', groq: 'openrouter' };
    const requested = model || 'openrouter';
    const isVision = !!imageAttachment && requested === 'openrouter';
    let provider = getProvider(requested);
    let usedProvider = requested;

    let fullResponse = '';
    try {
      if (isVision) {
        const historyForVision = messagesForLLM.slice(0, -1);
        for await (const chunk of provider.chatStreamMultimodal(historyForVision, imageAttachment.payload, userContentForLLM)) {
          fullResponse += chunk;
          res.write(`event: token\ndata: ${JSON.stringify({ content: chunk })}\n\n`);
        }
      } else {
        for await (const chunk of provider.chatStream(messagesForLLM)) {
          fullResponse += chunk;
          res.write(`event: token\ndata: ${JSON.stringify({ content: chunk })}\n\n`);
        }
      }
    } catch (streamErr) {
      if (streamErr.message.includes('429') && FALLBACK[requested] && !isVision) {
        const fallbackName = FALLBACK[requested];
        console.log(`Provider ${requested} rate-limited, falling back to ${fallbackName}`);
        res.write(`event: info\ndata: ${JSON.stringify({ message: `${requested} rate-limited, using ${fallbackName}` })}\n\n`);
        provider = getProvider(fallbackName);
        usedProvider = fallbackName;
        fullResponse = '';
        for await (const chunk of provider.chatStream(messagesForLLM)) {
          fullResponse += chunk;
          res.write(`event: token\ndata: ${JSON.stringify({ content: chunk })}\n\n`);
        }
      } else {
        throw streamErr;
      }
    }

    // Save assistant message
    const modelName = isVision ? provider.getVisionModelName() : provider.getModelName();
    const saved = await pool.query(
      `INSERT INTO messages (chat_id, role, content, metadata)
       VALUES ($1, 'assistant', $2, $3) RETURNING id`,
      [chatId, fullResponse, JSON.stringify({ provider: usedProvider, model: modelName })]
    );

    res.write(`event: done\ndata: ${JSON.stringify({ messageId: saved.rows[0].id, model: modelName })}\n\n`);
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

// GET /api/chats/:id/messages
router.get('/:id/messages', authMiddleware, async (req, res) => {
  try {
    const chatCheck = await pool.query(
      'SELECT id FROM chats WHERE id = $1 AND user_id = $2',
      [req.params.id, req.userId]
    );
    if (chatCheck.rowCount === 0) return res.status(404).json({ error: 'Chat not found' });

    const result = await pool.query(
      'SELECT role, content, created_at FROM messages WHERE chat_id = $1 ORDER BY created_at ASC',
      [req.params.id]
    );
    return res.json({ messages: result.rows });
  } catch (err) {
    console.error('Get messages error:', err);
    return res.status(500).json({ error: 'Failed to fetch messages' });
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
  const { messages, title } = req.body;
  const fields = [];
  const values = [];
  let idx = 1;
  if (messages !== undefined) { fields.push(`message = $${idx++}`); values.push(JSON.stringify(messages)); }
  if (title !== undefined) { fields.push(`title = $${idx++}`); values.push(title); }
  if (fields.length === 0) return res.status(400).json({ error: 'Nothing to update' });
  fields.push(`updated_at = NOW()`);
  values.push(req.params.id, req.userId);
  try {
    const result = await pool.query(
      `UPDATE chats SET ${fields.join(', ')} WHERE id = $${idx} AND user_id = $${idx + 1} RETURNING *`,
      values
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
