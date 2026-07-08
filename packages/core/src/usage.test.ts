import { describe, expect, it } from "vitest";
import { TAGS_MODEL_ID } from "./model-labels";
import { estimateCostMicroUsd } from "./usage";

describe("estimateCostMicroUsd", () => {
  it("computes GLM 5.2 Fast cost from fresh input and output", () => {
    const cost = estimateCostMicroUsd(TAGS_MODEL_ID, {
      promptTokens: 1_000_000,
      completionTokens: 1_000_000,
      freshInputTokens: 1_000_000,
      cacheWriteTokens: 0,
      cachedReadTokens: 0,
    });
    expect(cost).toBe(8_700_000);
  });

  it("applies cache-aware pricing when breakdown is known", () => {
    const cost = estimateCostMicroUsd(TAGS_MODEL_ID, {
      promptTokens: 11_134,
      completionTokens: 34,
      freshInputTokens: 2,
      cacheWriteTokens: 11_132,
      cachedReadTokens: 0,
    });
    expect(cost).toBe(23_606);
  });

  it("prefers provider-reported cost from opencode", () => {
    const cost = estimateCostMicroUsd(TAGS_MODEL_ID, {
      promptTokens: 1_000,
      completionTokens: 100,
      providerCostMicroUsd: 42_500,
    });
    expect(cost).toBe(42_500);
  });

  it("uses fallback rates for unknown models", () => {
    const cost = estimateCostMicroUsd("unknown/model", {
      promptTokens: 1_000_000,
      completionTokens: 1_000_000,
    });
    expect(cost).toBe(8_700_000);
  });
});
