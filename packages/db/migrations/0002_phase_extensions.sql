-- Phase 1–9 extension tables and space policy FKs

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TYPE memory_kind AS ENUM ('fact', 'summary', 'preference', 'decision', 'artifact');
CREATE TYPE artifact_kind AS ENUM ('markdown', 'html', 'diff', 'image', 'table', 'json', 'link');

CREATE TABLE approval_policies (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  name text NOT NULL,
  require_admin_role boolean NOT NULL DEFAULT false,
  approver_allowlist jsonb NOT NULL DEFAULT '[]'::jsonb,
  allow_self_approve boolean NOT NULL DEFAULT false,
  default_expiry_minutes int NOT NULL DEFAULT 60,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE budget_policies (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  name text NOT NULL,
  monthly_budget_micro_usd bigint NOT NULL DEFAULT 0,
  hard_limit boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE memory_policies (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  name text NOT NULL,
  allow_agent_proposed boolean NOT NULL DEFAULT true,
  require_approval_for_sensitive boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE spaces
  ADD COLUMN IF NOT EXISTS approval_policy_id uuid REFERENCES approval_policies(id),
  ADD COLUMN IF NOT EXISTS budget_policy_id uuid REFERENCES budget_policies(id),
  ADD COLUMN IF NOT EXISTS memory_policy_id uuid REFERENCES memory_policies(id);

CREATE TABLE memories (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  space_id uuid NOT NULL REFERENCES spaces(id),
  kind memory_kind NOT NULL,
  content text NOT NULL,
  search_text text NOT NULL,
  search_tsv tsvector GENERATED ALWAYS AS (to_tsvector('english', search_text)) STORED,
  source_thread_id uuid REFERENCES threads(id),
  source_message_id uuid REFERENCES messages(id),
  confidence int NOT NULL DEFAULT 50,
  created_by source NOT NULL DEFAULT 'agent',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX memories_search_tsv_idx ON memories USING GIN (search_tsv);
CREATE INDEX memories_search_trgm_idx ON memories USING GIN (search_text gin_trgm_ops);
CREATE INDEX memories_space_active_idx ON memories (space_id) WHERE deleted_at IS NULL;

ALTER TABLE memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE memories FORCE ROW LEVEL SECURITY;

CREATE POLICY memories_space_isolation ON memories
  USING (
    organization_id = current_setting('tags.organization_id', true)::uuid
    AND space_id = current_setting('tags.space_id', true)::uuid
    AND deleted_at IS NULL
  )
  WITH CHECK (
    organization_id = current_setting('tags.organization_id', true)::uuid
    AND space_id = current_setting('tags.space_id', true)::uuid
  );

CREATE POLICY memories_admin_bypass ON memories
  USING (
    current_setting('tags.role', true) = 'admin'
    AND organization_id = current_setting('tags.organization_id', true)::uuid
  )
  WITH CHECK (
    current_setting('tags.role', true) = 'admin'
    AND organization_id = current_setting('tags.organization_id', true)::uuid
  );

CREATE TABLE artifacts (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  space_id uuid NOT NULL REFERENCES spaces(id),
  thread_id uuid NOT NULL REFERENCES threads(id),
  run_id uuid NOT NULL REFERENCES runs(id),
  kind artifact_kind NOT NULL,
  title text NOT NULL,
  url text NOT NULL,
  content_ref text,
  content_type text,
  size_bytes bigint,
  metadata jsonb,
  body text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX artifacts_thread_created_idx ON artifacts (thread_id, created_at);

CREATE TABLE audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  space_id uuid REFERENCES spaces(id),
  actor_user_id uuid REFERENCES users(id),
  actor_type source NOT NULL DEFAULT 'system',
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX audit_events_org_created_idx ON audit_events (organization_id, created_at);
CREATE INDEX audit_events_space_created_idx ON audit_events (space_id, created_at);

CREATE TABLE usage_records (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  space_id uuid NOT NULL REFERENCES spaces(id),
  run_id uuid NOT NULL REFERENCES runs(id),
  model_id text NOT NULL,
  provider text,
  prompt_tokens int NOT NULL DEFAULT 0,
  completion_tokens int NOT NULL DEFAULT 0,
  total_tokens int NOT NULL DEFAULT 0,
  cost_micro_usd bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX usage_records_space_created_idx ON usage_records (space_id, created_at);

CREATE TABLE schedules (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  space_id uuid NOT NULL REFERENCES spaces(id),
  cron text NOT NULL,
  timezone text NOT NULL DEFAULT 'UTC',
  prompt text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  last_run_at timestamptz,
  next_run_at timestamptz,
  created_by_user_id uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX schedules_space_enabled_idx ON schedules (space_id) WHERE enabled = true;
