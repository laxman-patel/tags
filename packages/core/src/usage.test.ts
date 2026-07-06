import { describe, expect, it } from "vitest";
import { TAGS_MODEL_ID } from "./model-labels";
import { estimateCostMicroUsd } from "./usage";

describe("estimateCostMicroUsd", () => {
  it("computes GLM 5.2 Fast cost", () => {
    const cost = estimateCostMicroUsd(TAGS_MODEL_ID, 1_000_000, 1_000_000);
    expect(cost).toBe(300_000);
  });

  it("uses fallback rates for unknown models", () => {
    const cost = estimateCostMicroUsd("unknown/model", 1_000_000, 1_000_000);
    expect(cost).toBe(2_000_000);
  });
});
