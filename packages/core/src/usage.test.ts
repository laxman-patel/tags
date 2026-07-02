import { describe, expect, it } from "vitest";
import { estimateCostMicroUsd } from "./usage";

describe("estimateCostMicroUsd", () => {
  it("computes known Fireworks model cost", () => {
    const cost = estimateCostMicroUsd(
      "accounts/fireworks/models/kimi-k2-instruct",
      1_000_000,
      1_000_000,
    );
    expect(cost).toBe(310_000);
  });

  it("uses fallback rates for unknown models", () => {
    const cost = estimateCostMicroUsd("unknown/model", 1_000_000, 1_000_000);
    expect(cost).toBe(2_000_000);
  });
});
