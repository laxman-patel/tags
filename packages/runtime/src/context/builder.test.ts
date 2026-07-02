import { describe, expect, it } from "vitest";
import { packThreadHistory } from "./builder";
import type { ModelMessage } from "ai";

describe("packThreadHistory", () => {
  it("returns history unchanged when under char budget", () => {
    const history: ModelMessage[] = [
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi" },
    ];
    expect(packThreadHistory(history)).toEqual(history);
  });

  it("drops oldest messages when over budget and prepends omission notice", () => {
    const long = "x".repeat(15_000);
    const history: ModelMessage[] = [
      { role: "user", content: long },
      { role: "assistant", content: long },
      { role: "user", content: "recent reply" },
    ];
    const packed = packThreadHistory(history);
    expect(packed.length).toBeGreaterThan(1);
    expect(packed[0]?.content).toContain("Earlier thread messages omitted");
    expect(packed.at(-1)?.content).toBe("recent reply");
  });
});
