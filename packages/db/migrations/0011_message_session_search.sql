CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS search_tsv tsvector
  GENERATED ALWAYS AS (to_tsvector('english', text)) STORED;

CREATE INDEX IF NOT EXISTS messages_search_tsv_idx
  ON messages USING GIN (search_tsv);

CREATE INDEX IF NOT EXISTS messages_space_created_idx
  ON messages (space_id, created_at DESC);
