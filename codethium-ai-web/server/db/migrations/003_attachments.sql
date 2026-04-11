-- Phase 5: GIN index on metadata for attachment/RAG queries.
-- The metadata JSONB column already exists on the messages table.
-- No structural change needed — attachments are stored as metadata->'attachments'.
CREATE INDEX IF NOT EXISTS idx_messages_metadata ON messages USING GIN (metadata);
