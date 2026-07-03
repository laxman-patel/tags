ALTER TABLE space_configs ADD COLUMN repo_urls jsonb NOT NULL DEFAULT '[]'::jsonb;

UPDATE space_configs
SET repo_urls = jsonb_build_array(repo_url)
WHERE repo_url IS NOT NULL AND repo_url <> '';
