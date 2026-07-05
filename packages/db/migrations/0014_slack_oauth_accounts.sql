ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS bot_access_token_ciphertext text,
  ADD COLUMN IF NOT EXISTS bot_refresh_token_ciphertext text,
  ADD COLUMN IF NOT EXISTS bot_token_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS bot_user_id text,
  ADD COLUMN IF NOT EXISTS app_id text,
  ADD COLUMN IF NOT EXISTS bot_scopes jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS installed_by_slack_user_id text,
  ADD COLUMN IF NOT EXISTS installed_by_user_id uuid REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS slack_oauth_states (
  state text PRIMARY KEY,
  clerk_user_id text NOT NULL,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  redirect_uri text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS users_clerk_external_unique_idx
  ON users (external_user_id)
  WHERE external_provider = 'clerk';

CREATE UNIQUE INDEX IF NOT EXISTS workspaces_org_provider_unique_idx
  ON workspaces (organization_id, provider);
