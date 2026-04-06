CREATE TABLE IF NOT EXISTS messages (
  id         SERIAL PRIMARY KEY,
  chat_id    INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  role       VARCHAR(16) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content    TEXT NOT NULL,
  metadata   JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id);
