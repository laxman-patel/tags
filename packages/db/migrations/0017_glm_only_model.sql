-- Tags uses GLM 5.2 Fast exclusively; normalize any stale Space configs.
UPDATE space_configs
SET model_id = 'accounts/fireworks/routers/glm-5p2-fast'
WHERE is_active = true
  AND model_id <> 'accounts/fireworks/routers/glm-5p2-fast';
