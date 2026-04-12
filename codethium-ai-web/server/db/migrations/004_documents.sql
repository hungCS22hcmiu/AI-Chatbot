-- Documents table for RAG (Retrieval-Augmented Generation)
-- Stores full extracted text from uploaded files/PDFs with PostgreSQL FTS indexing.
CREATE TABLE IF NOT EXISTS documents (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  chat_id     INTEGER REFERENCES chats(id) ON DELETE SET NULL,
  filename    VARCHAR(255) NOT NULL,
  content     TEXT NOT NULL,
  content_fts tsvector GENERATED ALWAYS AS (to_tsvector('english', content)) STORED,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_documents_content_fts ON documents USING gin(content_fts);
CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id);
