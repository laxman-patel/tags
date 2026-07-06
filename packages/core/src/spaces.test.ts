import { describe, expect, it } from "vitest";
import { normalizeConnectionIds } from "./spaces";

describe("normalizeConnectionIds", () => {
  it("trims, lowercases, drops blanks, and deduplicates connection ids", () => {
    expect(normalizeConnectionIds([" Gmail ", "gmail", "", "GitHub"])).toEqual([
      "gmail",
      "github",
    ]);
  });
});
