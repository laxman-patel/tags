import { describe, expect, it } from "vitest";
import {
  formatModelLabel,
  resolveRuntimeModelId,
  TAGS_DEFAULT_MODEL_ID,
} from "./model-labels";

describe("resolveRuntimeModelId", () => {
  it("maps deprecated Fireworks models to the default router", () => {
    expect(resolveRuntimeModelId("accounts/fireworks/models/kimi-k2-instruct")).toBe(
      TAGS_DEFAULT_MODEL_ID,
    );
  });

  it("passes through current model ids unchanged", () => {
    expect(resolveRuntimeModelId(TAGS_DEFAULT_MODEL_ID)).toBe(TAGS_DEFAULT_MODEL_ID);
  });
});

describe("formatModelLabel", () => {
  it("maps Fireworks router ids to friendly names", () => {
    expect(formatModelLabel("accounts/fireworks/routers/glm-5p2-fast")).toBe("GLM 5.2 Fast");
  });

  it("maps Fireworks model ids to friendly names", () => {
    expect(formatModelLabel("accounts/fireworks/models/kimi-k2-instruct")).toBe(
      "Kimi K2 Instruct",
    );
  });

  it("humanizes unknown provider slugs", () => {
    expect(formatModelLabel("openai/gpt-4o-mini")).toBe("GPT-4o Mini");
  });
});
