-- Per-Space, per-subtool approval opt-in.
-- Presence of a row means the tool (identified by tool_key) requires human
-- approval before it runs in this Space. No row => runs immediately.
-- Default posture is "no approval for anything"; approvals are opt-in.
CREATE TABLE IF NOT EXISTS space_tool_approvals (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  space_id uuid NOT NULL REFERENCES spaces(id),
  tool_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (space_id, tool_key)
);

CREATE INDEX IF NOT EXISTS space_tool_approvals_space_idx
  ON space_tool_approvals (space_id);
