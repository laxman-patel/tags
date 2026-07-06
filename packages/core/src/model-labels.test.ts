import { describe, expect, it } from "vitest";
import {
  formatModelLabel,
  TAGS_MODEL_ID,
  TAGS_MODEL_LABEL,
} from "./model-labels";

describe("formatModelLabel", () => {
  it("always returns the Tags model label", () => {
    expect(formatModelLabel(TAGS_MODEL_ID)).toBe(TAGS_MODEL_LABEL);
    expect(formatModelLabel("accounts/fireworks/models/kimi-k2-instruct")).toBe(TAGS_MODEL_LABEL);
    expect(formatModelLabel()).toBe(TAGS_MODEL_LABEL);
  });
});
