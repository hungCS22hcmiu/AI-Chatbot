const express = require('express');
const { z } = require('zod');
const pool = require('../db/pool');
const authMiddleware = require('../middleware/auth');
const { getProvider } = require('../services/llm');
const { extractText } = require('../services/fileParser');
const { searchDocuments } = require('../services/rag');

const { streamLimiter } = require('../middleware/rateLimit');

const router = express.Router();

const attachmentSchema = z.object({
  type: z.enum(['image', 'file', 'pdf']),
  payload: z.string().min(1),
  name: z.string().min(1),
});

const streamSchema = z.object({
  chatId: z.number().int().positive(),
  content: z.string().min(1).max(10000).trim(),
  model: z.enum(['openrouter', 'groq', 'local', 'gemini']).optional(),
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

    // Inject text-file context as prefix for LLM (not stored in DB)
    const fileAttachments = attachments?.filter(a => a.type === 'file') || [];
    const multimodalAttachments = attachments?.filter(a => a.type === 'image' || a.type === 'pdf') || [];
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

    // RAG: inject relevant document context when no inline attachments
    if (!attachments?.length) {
      const ragChunks = await searchDocuments(req.userId, content, 4);
      if (ragChunks.length > 0) {
        const ragContext = ragChunks
          .map(c => `[${c.filename}]\n${c.snippet}`)
          .join('\n\n---\n\n');
        messagesForLLM.unshift({
          role: 'system',
          content: `Relevant context from uploaded documents:\n\n${ragContext}`,
        });
      }
    }

    // SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    // Auto-route image/PDF attachments to Gemini regardless of selected model
    const isMultimodal = multimodalAttachments.length > 0;
    const hasImages = multimodalAttachments.some(a => a.type === 'image');
    const pdfOnly = isMultimodal && !hasImages;
    const FALLBACK = { openrouter: 'groq', groq: 'openrouter' };
    const requested = isMultimodal ? 'gemini' : (model || 'openrouter');
    let provider = getProvider(requested);
    let usedProvider = requested;

    let fullResponse = '';
    try {
      if (isMultimodal) {
        const historyForMultimodal = messagesForLLM.slice(0, -1);
        for await (const chunk of provider.chatStreamMultimodal(historyForMultimodal, multimodalAttachments, userContentForLLM)) {
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
      const is429 = streamErr.message.includes('429');

      // Non-multimodal 429: existing OpenRouter <-> Groq fallback
      if (is429 && FALLBACK[requested] && !isMultimodal) {
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
      }
      // Multimodal 429 with images: no fallback possible (text LLMs can't see)
      else if (is429 && isMultimodal && hasImages) {
        const retryMatch = streamErr.message.match(/retry in ([\d.]+)s/i);
        const retryHint = retryMatch ? ` Retry in ~${Math.ceil(parseFloat(retryMatch[1]))}s.` : '';
        const friendly = `Gemini rate limit exceeded.${retryHint} Image requests can't fall back to text-only providers — try again shortly, or set GEMINI_MODEL in your .env to a model with available quota.`;
        console.log(`Gemini 429 with images — no fallback possible`);
        res.write(`event: error\ndata: ${JSON.stringify({ error: friendly })}\n\n`);
        return res.end();
      }
      // Multimodal 429 with PDFs only: extract text via pdf-parse, retry with text provider
      else if (is429 && pdfOnly) {
        const fallbackName = model || 'openrouter';
        console.log(`Gemini 429 on PDF-only request — extracting text and retrying with ${fallbackName}`);
        res.write(`event: info\ndata: ${JSON.stringify({ message: `Gemini rate-limited — extracting PDF text and using ${fallbackName}` })}\n\n`);

        const pdfTexts = await Promise.all(
          multimodalAttachments.map(async (a) => {
            const b64 = a.payload.split(',')[1] || '';
            const buf = Buffer.from(b64, 'base64');
            const text = await extractText(buf, 'application/pdf');
            return `[File: ${a.name}]\n${text}`;
          })
        );
        const augmentedUserContent = `${pdfTexts.join('\n\n---\n\n')}\n\n---\n\nUser question: ${content}`;
        const rebuiltMessages = messagesForLLM.map((msg, i) =>
          i === messagesForLLM.length - 1 && msg.role === 'user'
            ? { ...msg, content: augmentedUserContent }
            : msg
        );

        provider = getProvider(fallbackName);
        usedProvider = fallbackName;
        fullResponse = '';
        for await (const chunk of provider.chatStream(rebuiltMessages)) {
          fullResponse += chunk;
          res.write(`event: token\ndata: ${JSON.stringify({ content: chunk })}\n\n`);
        }
      } else {
        throw streamErr;
      }
    }

    // Save assistant message
    const modelName = provider.getModelName();
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
