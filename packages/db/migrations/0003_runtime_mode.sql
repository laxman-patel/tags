ALTER TABLE space_configs
  ADD COLUMN IF NOT EXISTS runtime_mode text NOT NULL DEFAULT 'opencode';
