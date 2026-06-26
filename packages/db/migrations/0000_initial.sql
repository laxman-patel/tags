-- Phase 0 schema + RLS scaffolding

CREATE TYPE provider AS ENUM ('slack');
CREATE TYPE user_role AS ENUM ('owner', 'admin', 'member');
CREATE TYPE author_type AS ENUM ('human', 'agent', 'system');
CREATE TYPE thread_status AS ENUM ('open', 'running', 'waiting', 'done', 'failed');
CREATE TYPE run_status AS ENUM ('queued', 'streaming', 'waiting', 'done', 'failed', 'cancelled');
CREATE TYPE run_trigger AS ENUM ('mention', 'reply', 'schedule', 'approval_response');
CREATE TYPE tool_status AS ENUM ('pending', 'succeeded', 'failed');
CREATE TYPE approval_status AS ENUM ('pending', 'approved', 'rejected', 'expired');
CREATE TYPE risk_level AS ENUM ('none', 'low', 'medium', 'high');
CREATE TYPE reasoning_effort AS ENUM (
  'provider-default', 'none', 'minimal', 'low', 'medium', 'high', 'xhigh'
);
CREATE TYPE source AS ENUM ('human', 'agent', 'system');

CREATE TABLE organizations (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  external_provider text NOT NULL,
  external_user_id text NOT NULL,
  display_name text,
  role user_role NOT NULL DEFAULT 'member',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, external_provider, external_user_id)
);

CREATE TABLE workspaces (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  provider provider NOT NULL,
  external_workspace_id text NOT NULL,
  connect_installation_id text,
  name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, external_workspace_id)
);

CREATE TABLE spaces (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  provider provider NOT NULL,
  external_space_id text NOT NULL,
  name text NOT NULL,
  slug text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, external_space_id),
  UNIQUE (organization_id, slug)
);

CREATE TABLE space_configs (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  space_id uuid NOT NULL REFERENCES spaces(id),
  version int NOT NULL,
  model_id text NOT NULL,
  reasoning text NOT NULL DEFAULT 'provider-default',
  instructions text NOT NULL,
  enabled_skills jsonb NOT NULL DEFAULT '[]'::jsonb,
  enabled_tools jsonb NOT NULL DEFAULT '[]'::jsonb,
  enabled_connections jsonb NOT NULL DEFAULT '[]'::jsonb,
  max_steps int NOT NULL DEFAULT 12,
  is_active boolean NOT NULL DEFAULT false,
  created_by_user_id uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (space_id, version)
);

CREATE UNIQUE INDEX space_configs_space_active_idx ON space_configs (space_id) WHERE is_active = true;

CREATE TABLE threads (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  space_id uuid NOT NULL REFERENCES spaces(id),
  provider_thread_id text NOT NULL,
  root_message_id text NOT NULL,
  title text,
  summary jsonb,
  status thread_status NOT NULL DEFAULT 'open',
  active_run_id uuid,
  created_by_user_id uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (space_id, provider_thread_id)
);

CREATE TABLE messages (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  space_id uuid NOT NULL REFERENCES spaces(id),
  thread_id uuid NOT NULL REFERENCES threads(id),
  provider_message_id text NOT NULL,
  author_type author_type NOT NULL,
  author_id text NOT NULL,
  text text NOT NULL,
  ui_message_json jsonb,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (thread_id, provider_message_id)
);

CREATE INDEX messages_thread_created_idx ON messages (thread_id, created_at);

CREATE TABLE runs (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  space_id uuid NOT NULL REFERENCES spaces(id),
  thread_id uuid NOT NULL REFERENCES threads(id),
  space_config_version int NOT NULL,
  workflow_run_id text,
  status run_status NOT NULL DEFAULT 'queued',
  trigger run_trigger NOT NULL,
  model_id text NOT NULL,
  idempotency_key text NOT NULL UNIQUE,
  input_message_id uuid REFERENCES messages(id),
  token_usage jsonb,
  cost_micro_usd bigint,
  error jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

CREATE INDEX runs_thread_started_idx ON runs (thread_id, started_at DESC);
CREATE INDEX runs_status_idx ON runs (status);

ALTER TABLE threads
  ADD CONSTRAINT threads_active_run_id_fkey
  FOREIGN KEY (active_run_id) REFERENCES runs(id);

CREATE TABLE run_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES runs(id),
  seq bigint NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, seq)
);

CREATE TABLE tool_invocations (
  id uuid PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES runs(id),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  space_id uuid NOT NULL REFERENCES spaces(id),
  tool_name text NOT NULL,
  tool_input jsonb NOT NULL,
  idempotency_key text NOT NULL UNIQUE,
  external_resource_kind text,
  external_resource_id text,
  status tool_status NOT NULL DEFAULT 'pending',
  result jsonb,
  error jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX tool_invocations_run_idx ON tool_invocations (run_id);

CREATE TABLE approval_requests (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  space_id uuid NOT NULL REFERENCES spaces(id),
  run_id uuid NOT NULL REFERENCES runs(id),
  thread_id uuid NOT NULL REFERENCES threads(id),
  tool_invocation_id uuid NOT NULL REFERENCES tool_invocations(id),
  request_id text NOT NULL UNIQUE,
  tool_name text NOT NULL,
  tool_input jsonb NOT NULL,
  risk_level risk_level NOT NULL,
  request_text text NOT NULL,
  status approval_status NOT NULL DEFAULT 'pending',
  requested_by_user_id uuid REFERENCES users(id),
  resolved_by_user_id uuid REFERENCES users(id),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE INDEX approval_requests_status_expires_idx ON approval_requests (status, expires_at);
CREATE INDEX approval_requests_run_idx ON approval_requests (run_id);

-- RLS policies (messages as representative tenant-scoped table for Phase 0 tests)
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages FORCE ROW LEVEL SECURITY;

CREATE POLICY messages_space_isolation ON messages
  USING (
    organization_id = current_setting('tags.organization_id', true)::uuid
    AND space_id = current_setting('tags.space_id', true)::uuid
  )
  WITH CHECK (
    organization_id = current_setting('tags.organization_id', true)::uuid
    AND space_id = current_setting('tags.space_id', true)::uuid
  );

CREATE POLICY messages_admin_bypass ON messages
  USING (
    current_setting('tags.role', true) = 'admin'
    AND organization_id = current_setting('tags.organization_id', true)::uuid
  )
  WITH CHECK (
    current_setting('tags.role', true) = 'admin'
    AND organization_id = current_setting('tags.organization_id', true)::uuid
  );

ALTER TABLE runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE runs FORCE ROW LEVEL SECURITY;

CREATE POLICY runs_space_isolation ON runs
  USING (
    organization_id = current_setting('tags.organization_id', true)::uuid
    AND space_id = current_setting('tags.space_id', true)::uuid
  )
  WITH CHECK (
    organization_id = current_setting('tags.organization_id', true)::uuid
    AND space_id = current_setting('tags.space_id', true)::uuid
  );

CREATE POLICY runs_admin_bypass ON runs
  USING (
    current_setting('tags.role', true) = 'admin'
    AND organization_id = current_setting('tags.organization_id', true)::uuid
  )
  WITH CHECK (
    current_setting('tags.role', true) = 'admin'
    AND organization_id = current_setting('tags.organization_id', true)::uuid
  );
