ALTER TABLE space_configs
  ADD COLUMN IF NOT EXISTS auto_approve_readonly_composio boolean NOT NULL DEFAULT false;
