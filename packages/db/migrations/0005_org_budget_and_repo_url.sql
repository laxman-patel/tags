-- Org-level budget policy reference
ALTER TABLE organizations ADD COLUMN budget_policy_id uuid REFERENCES budget_policies(id);

-- Per-Space default repo for opencode coding runs
ALTER TABLE space_configs ADD COLUMN repo_url text;
