/** Tags uses GLM 5.2 Fast (Fireworks router) for all inference paths. */
export const TAGS_DEFAULT_MODEL_ID = "accounts/fireworks/routers/glm-5p2-fast";

const KNOWN_MODEL_LABELS: Record<string, string> = {
  [TAGS_DEFAULT_MODEL_ID]: "GLM 5.2 Fast",
  "accounts/fireworks/models/kimi-k2-instruct": "Kimi K2 Instruct",
};

const SLUG_LABELS: Record<string, string> = {
  "glm-5p2-fast": "GLM 5.2 Fast",
  "kimi-k2-instruct": "Kimi K2 Instruct",
  "gpt-4o-mini": "GPT-4o Mini",
};

function humanizeSlug(slug: string): string {
  const known = SLUG_LABELS[slug];
  if (known) return known;

  return slug
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/** User-facing model name for admin UI and run details. */
export function formatModelLabel(modelId: string): string {
  const known = KNOWN_MODEL_LABELS[modelId];
  if (known) return known;

  const fireworks = modelId.match(/^accounts\/fireworks\/(?:routers|models)\/(.+)$/);
  if (fireworks?.[1]) return humanizeSlug(fireworks[1]);

  const slash = modelId.lastIndexOf("/");
  if (slash >= 0) return humanizeSlug(modelId.slice(slash + 1));

  return humanizeSlug(modelId);
}
