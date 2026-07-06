/** Tags uses GLM 5.2 Fast (Fireworks router) for all inference paths. */
export const TAGS_MODEL_ID = "accounts/fireworks/routers/glm-5p2-fast";

export const TAGS_MODEL_LABEL = "GLM 5.2 Fast";

/** @deprecated Use {@link TAGS_MODEL_ID}. */
export const TAGS_DEFAULT_MODEL_ID = TAGS_MODEL_ID;

/** User-facing model name for admin UI and run details. */
export function formatModelLabel(_modelId?: string): string {
  return TAGS_MODEL_LABEL;
}
