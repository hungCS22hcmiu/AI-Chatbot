const pool = require('../db/pool');

// ---------------------------------------------------------------------------
// Intent detection — decides whether RAG is worth running at all.
// Conversational messages like "hello" or "thanks" have no information need.
// ---------------------------------------------------------------------------
const CONVERSATIONAL_PATTERNS = [
  /^(hi+|hey+|hello+|howdy|yo+|greetings?)[!.,?]*$/i,
  /^(good\s*(morning|afternoon|evening|night))[!.,?]*$/i,
  /^(thanks?|thank\s*you|thx|ty|cheers|great|awesome|nice|cool|ok+|okay|sure|got\s*it|perfect|understood)[!.,?]*$/i,
  /^(bye+|goodbye|see\s*ya?|later|cya)[!.,?]*$/i,
  /^how\s+are\s+you[!.,?]*$/i,
  /^what('?s|\s+is)\s+up[!.,?]*$/i,
  /^(yes|no|yeah|nope|yep|nah)[!.,?]*$/i,
  /^(lol|haha|hehe|xd)[!.,?]*$/i,
];

/**
 * Returns true when the message is pure small-talk / chit-chat.
 * RAG is skipped for these — there's nothing meaningful to retrieve.
 */
function isConversational(query) {
  const q = query.trim();
  return CONVERSATIONAL_PATTERNS.some(re => re.test(q));
}

// ---------------------------------------------------------------------------
// Query normalization — strips filler phrases and extracts the real intent.
// e.g. "can you help me understand bubble sort" → "bubble sort"
//      "i want to know about neural networks" → "neural networks"
// ---------------------------------------------------------------------------
const FILLER_PHRASES = [
  /\b(can\s+you|could\s+you|please|kindly)\s+(help\s+me\s+)?(with|on|about|understand|explain|tell\s+me|show\s+me|write|create|make|build|generate|give\s+me)(\s+a|\s+an|\s+me)?\b/gi,
  /\b(i\s+want\s+to\s+(know|understand|learn|see)|i\s+(need|would\s+like)\s+to|i\s+am\s+looking\s+for|i\s+need)\b/gi,
  /\b(what\s+is|what\s+are|how\s+(do|does|can|should|to)|why\s+(is|are|does|do))\b/gi,
  /\b(tell\s+me|explain|describe|show|help\s+me\s+with|give\s+me)\b/gi,
  /\b(please|kindly|just|simply|basically|actually|really|very|also|and|or|the|a|an|in|on|at|to|for|of|with|from)\b/gi,
];

/**
 * Strips filler words and interrogative preambles from a query so that
 * PostgreSQL FTS has cleaner, more focused terms to match against.
 * Falls back to the original query if normalization empties it.
 */
function normalizeQuery(query) {
  let q = query.trim();
  for (const pattern of FILLER_PHRASES) {
    q = q.replace(pattern, ' ');
  }
  q = q.replace(/\s{2,}/g, ' ').trim();
  // Keep original if stripping leaves fewer than 2 meaningful chars
  return q.length >= 2 ? q : query.trim();
}

// ---------------------------------------------------------------------------
// FTS helper — runs one plainto_tsquery search
// ---------------------------------------------------------------------------
async function runFtsQuery(userId, ftsQuery, limit) {
  const result = await pool.query(
    `SELECT
       filename,
       ts_headline(
         'english', content,
         plainto_tsquery('english', $1),
         'MaxFragments=2, MaxWords=55, MinWords=12, HighlightAll=false'
       ) AS snippet,
       ts_rank(content_fts, plainto_tsquery('english', $1)) AS rank
     FROM documents, plainto_tsquery('english', $1) q
     WHERE user_id = $2 AND content_fts @@ q
     ORDER BY rank DESC
     LIMIT $3`,
    [ftsQuery, userId, limit]
  );
  return result.rows;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Store a document's full text in the documents table for later RAG retrieval.
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
 * Smart full-text search over the current user's stored documents.
 *
 * Strategy:
 * 1. Skip entirely for conversational messages (greetings, thanks, etc.)
 * 2. Normalize the query to remove filler phrases, exposing core keywords
 * 3. Run FTS on the normalized query first
 * 4. If that returns nothing, fall back to the original raw query
 * 5. De-duplicate by filename+snippet and return top `limit` results
 *
 * @param {number} userId
 * @param {string} query    — raw user message text
 * @param {number} [limit=4]
 * @returns {Promise<Array<{filename: string, snippet: string}>>}
 */
async function searchDocuments(userId, query, limit = 4) {
  if (!query || query.trim().length === 0) return [];
  if (isConversational(query)) return [];

  try {
    const normalized = normalizeQuery(query);

    // Primary search on the cleaned-up query
    let rows = await runFtsQuery(userId, normalized, limit);

    // Fallback: if normalized query returned nothing, try the raw query
    if (rows.length === 0 && normalized !== query.trim()) {
      rows = await runFtsQuery(userId, query.trim(), limit);
    }

    // De-duplicate by (filename, snippet) in case both queries returned same rows
    const seen = new Set();
    return rows
      .filter(r => {
        const key = `${r.filename}::${r.snippet}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, limit)
      .map(({ filename, snippet }) => ({ filename, snippet }));
  } catch (err) {
    console.error('RAG search error (non-fatal):', err.message);
    return [];
  }
}

module.exports = { storeDocument, searchDocuments, isConversational, normalizeQuery };
