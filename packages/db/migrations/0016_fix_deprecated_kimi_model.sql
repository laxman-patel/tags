-- kimi-k2-instruct is no longer served by Fireworks; migrate active Spaces to GLM 5.2 Fast.
UPDATE space_configs
SET model_id = 'accounts/fireworks/routers/glm-5p2-fast'
WHERE is_active = true
  AND model_id IN (
    'accounts/fireworks/models/kimi-k2-instruct',
    'openai/gpt-4o-mini',
    'openai/gpt-4o'
  );
