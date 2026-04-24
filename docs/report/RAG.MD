# How RAG Works in CodeThium

## Overview

CodeThium's Retrieval-Augmented Generation (RAG) pipeline allows the AI to answer questions grounded in documents the user has previously uploaded — without the user needing to re-attach or re-reference them in every message. The pipeline has two halves: **ingestion** (storing document text at upload time) and **retrieval** (searching that text and injecting context at query time).

---

## Part 1 — Ingestion: Storing Documents at Upload Time

When a user uploads a file via `POST /api/upload/file`, the server processes it through two parallel paths.

### File Parsing (`services/fileParser.js`)

Two functions handle text extraction from the file buffer:

- **`extractText(buffer, mimetype)`** — extracts text and truncates it to **8,000 characters**. This truncated version is returned to the frontend as the `payload` field, giving the LLM inline context for the current message.
- **`extractFullText(buffer, mimetype)`** — extracts the **complete, untruncated text** of the file. This is used exclusively for RAG storage so that no information is lost for future queries.

Supported file types: `text/plain`, `text/x-python`, `text/javascript`, `application/javascript`, `application/json`, `text/css`, `text/html`, `text/typescript`, `text/x-java-source`, and `application/pdf`.

### Document Storage (`services/rag.js` → `storeDocument`)

The full text is written to the `documents` table in PostgreSQL:

```sql
INSERT INTO documents (user_id, chat_id, filename, content)
VALUES ($1, $2, $3, $4)
```

PostgreSQL automatically maintains a `content_fts` column — a `tsvector` generated column — from the `content` field, with a GIN index. This makes full-text search fast and requires no application-side indexing step.

The RAG store call is **fire-and-forget** (`.then(...).catch(...)`): if it fails, the upload response is still returned to the user immediately. The operation is non-fatal by design.

### How PDFs Are Handled at Ingestion

PDFs go through a dual path:

1. The **full text** is extracted via `pdf-parse` and stored in the `documents` table for RAG.
2. The **raw PDF bytes** are also encoded as a base64 data URL and returned to the frontend. When the user sends a message with this attachment, it is forwarded natively to Gemini's multimodal API, which can understand PDF structure, tables, and layout directly — not just the extracted text.

### Images Are Not Indexed for RAG

Images (`POST /api/upload/image`) are converted to a base64 data URL and returned to the client immediately. No text is extracted and nothing is stored in the `documents` table. Images are handled entirely at inference time via Gemini's multimodal API.

---

## Part 2 — Retrieval: Injecting Context at Query Time

Every time a user sends a message via `POST /api/chats/stream`, the server runs the RAG pipeline before calling the LLM.

### Step 1 — Guard: Skip for Conversational Messages

```js
if (!attachments?.length && !isConversational(content)) { ... }
```

`isConversational(query)` matches short social exchanges against a list of regex patterns (greetings, thanks, acknowledgements, etc.). If matched, RAG is skipped entirely — there is nothing meaningful to retrieve for "thanks!" or "ok". RAG also skips when the user has sent inline attachments, since the file content is already present in the message.

### Step 2 — Query Normalization

Before hitting the database, the raw user message is cleaned by `normalizeQuery(query)`. This strips filler phrases such as:

- "can you help me understand bubble sort" → "bubble sort"
- "i want to know about neural networks" → "neural networks"
- "please explain what recursion is" → "recursion"

The normalization removes interrogative preambles, common verbs of asking, stop words, and connectives using a series of regex replacements. The cleaned query exposes the core keywords that PostgreSQL full-text search is best at matching.

### Step 3 — Full-Text Search (`runFtsQuery`)

The server runs a PostgreSQL FTS query scoped to the current user's documents:

```sql
SELECT
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
LIMIT $3
```

Key details:
- **`plainto_tsquery`** parses the normalized query as natural language — no special syntax required from the user.
- **`ts_headline`** generates a readable excerpt from the matched section of the document (up to 2 fragments, 55 words max each). This is the `snippet` that gets injected into the LLM context.
- **`ts_rank`** scores each document by relevance. Results are ordered by rank and limited to the top **4** matches.
- The query is scoped to `user_id`, so users can never see each other's documents.

### Step 4 — Fallback to Raw Query

If the normalized query returns zero results, the system retries with the original unmodified user message. This handles cases where normalization over-strips the query (e.g. a very short or technical term that the regex accidentally removes).

```js
if (rows.length === 0 && normalized !== query.trim()) {
  rows = await runFtsQuery(userId, query.trim(), limit);
}
```

### Step 5 — De-duplication

Results from both the normalized and raw queries are de-duplicated by `(filename, snippet)` key before being returned, so the same passage is never injected twice.

### Step 6 — Context Injection as System Message

If any RAG chunks were found, they are prepended to the message history as an **ephemeral system message** — visible to the LLM but never stored in the `messages` table:

```js
messagesForLLM.unshift({
  role: 'system',
  content: `The following excerpts were retrieved from the user's uploaded documents and are relevant to the current question. Use them to give a grounded, accurate answer:\n\n${ragContext}`,
});
```

Each chunk is formatted as:

```
[Source: filename.pdf]
...excerpt text from ts_headline...
```

The LLM receives this alongside the full conversation history and uses the document context to produce a grounded answer.

---

## Attachment Handling Summary

| File Type | Upload Endpoint | RAG Indexed? | Sent to LLM as | Provider Override |
|-----------|----------------|-------------|---------------|-------------------|
| Image (jpg, png, …) | `/api/upload/image` | No | Base64 data URL via `chatStreamMultimodal` | Forces Gemini |
| PDF | `/api/upload/file` | Yes (full text) | Base64 data URL via `chatStreamMultimodal` | Forces Gemini |
| Text / Code / JSON | `/api/upload/file` | Yes (full text) | Inline text prefix in user message | No override |

---

## What Is and Is Not Stored in the Database

| Data | Stored? | Location |
|------|---------|----------|
| Full document text | Yes | `documents.content` |
| File name | Yes | `documents.filename` |
| Base64 image/PDF payload | **No** | Never written to DB |
| Attachment type + name | Yes (metadata only) | `messages.metadata` JSONB |
| RAG system message | **No** | Ephemeral — injected at runtime only |
| Web search context | **No** | Ephemeral — injected at runtime only |

This design keeps the database lean: binary payloads are never persisted, so storage scales with document text rather than file size.

---

## Data Flow Diagram

```
User uploads file
        │
        ▼
POST /api/upload/file
        │
        ├── extractText()  ──────────────────────► returned to client (8K truncated)
        │                                           stored in frontend state as attachment.payload
        │
        └── extractFullText()  ──────────────────► storeDocument() ──► documents table
                                                                         (content_fts tsvector auto-generated)

User sends message
        │
        ▼
POST /api/chats/stream
        │
        ├── [if attachments present] ────────────► skip RAG, use inline file context or multimodal API
        │
        └── [if no attachments]
                │
                ├── isConversational(content)? ──► skip RAG
                │
                └── normalizeQuery(content)
                          │
                          ▼
                    runFtsQuery(userId, normalizedQuery, 4)
                          │
                          ├── results found ──────► inject as system message to LLM
                          │
                          └── no results ──────────► retry with raw query
                                                      │
                                                      ├── results found ──► inject as system message
                                                      └── no results ──────► proceed without RAG context
```
