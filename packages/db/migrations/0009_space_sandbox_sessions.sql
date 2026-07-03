CREATE TABLE space_sandbox_sessions (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  space_id uuid NOT NULL REFERENCES spaces(id),
  provider text NOT NULL DEFAULT 'e2b',
  external_sandbox_id text,
  template text NOT NULL,
  repo_url text,
  workdir text NOT NULL,
  status text NOT NULL DEFAULT 'ready',
  active_run_id uuid REFERENCES runs(id),
  lease_expires_at timestamptz,
  last_used_at timestamptz,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX space_sandbox_sessions_space_idx ON space_sandbox_sessions (space_id);
CREATE INDEX space_sandbox_sessions_status_lease_idx ON space_sandbox_sessions (status, lease_expires_at);
