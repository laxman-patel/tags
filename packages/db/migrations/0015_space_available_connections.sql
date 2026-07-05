ALTER TABLE space_configs
  ADD COLUMN IF NOT EXISTS available_connections jsonb NOT NULL DEFAULT '[]'::jsonb;

UPDATE space_configs
SET available_connections = (
  SELECT jsonb_agg(DISTINCT value)
  FROM jsonb_array_elements_text(
    COALESCE(available_connections, '[]'::jsonb) || COALESCE(enabled_connections, '[]'::jsonb)
  ) AS elems(value)
)
WHERE available_connections = '[]'::jsonb
  AND enabled_connections <> '[]'::jsonb;
