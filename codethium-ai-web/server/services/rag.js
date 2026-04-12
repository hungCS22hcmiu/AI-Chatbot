const pool = require('../db/pool');

/**
 * Store a document's full text in the documents table for later RAG retrieval.
 * @param {number} userId
 * @param {number|null} chatId
 * @param {string} filename
 * @param {string} content  — full extracted text, no truncation
 * @returns {Promise<number>} inserted document id
 */
async function storeDocument(userId, chatId, filename, content) {
  const result = await pool.query(
    `INSERT INTO documents (user_id, chat_id, filename, content)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [userId, chatId || null, filename, content]
  );
  return result.rows[0].id;
}

/**
 * Full-text search over the current user's stored documents.
 * Returns up to `limit` relevant snippets ordered by relevance.
 * Silently returns [] on FTS parse errors (e.g. special-character-only queries).
 *
 * @param {number} userId
 * @param {string} query    — raw user message text
 * @param {number} [limit=4]
 * @returns {Promise<Array<{filename: string, snippet: string}>>}
 */
async function searchDocuments(userId, query, limit = 4) {
  if (!query || query.trim().length === 0) return [];

  try {
    const result = await pool.query(
      `SELECT
         filename,
         ts_headline(
           'english', content,
           plainto_tsquery('english', $1),
           'MaxFragments=2, MaxWords=50, MinWords=10'
         ) AS snippet
       FROM documents, plainto_tsquery('english', $1) q
       WHERE user_id = $2 AND content_fts @@ q
       ORDER BY ts_rank(content_fts, q) DESC
       LIMIT $3`,
      [query, userId, limit]
    );
    return result.rows;
  } catch (err) {
    // FTS can fail on unusual queries — don't break the chat stream
    console.error('RAG search error (non-fatal):', err.message);
    return [];
  }
}

module.exports = { storeDocument, searchDocuments };
