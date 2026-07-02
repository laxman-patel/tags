CREATE TABLE question_requests (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  space_id uuid NOT NULL REFERENCES spaces(id),
  run_id uuid NOT NULL REFERENCES runs(id),
  thread_id uuid NOT NULL REFERENCES threads(id),
  tool_invocation_id uuid NOT NULL REFERENCES tool_invocations(id),
  request_id text NOT NULL,
  question_text text NOT NULL,
  answer_text text,
  status text NOT NULL DEFAULT 'pending',
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  answered_at timestamptz
);

CREATE UNIQUE INDEX question_requests_request_id_idx ON question_requests (request_id);
CREATE INDEX question_requests_status_expires_idx ON question_requests (status, expires_at);
