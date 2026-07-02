import { describe, expect, it } from "vitest";
import { isApprovedToolMatch } from "./approval-gate";
import { toolIdempotencyKey } from "./types";

describe("toolIdempotencyKey", () => {
  it("is stable for the same input", () => {
    const input = { foo: "bar" };
    const a = toolIdempotencyKey("run-1", "create_artifact", input);
    const b = toolIdempotencyKey("run-1", "create_artifact", input);
    expect(a).toBe(b);
  });

  it("differs when tool name or input changes", () => {
    const input = { foo: "bar" };
    const base = toolIdempotencyKey("run-1", "create_artifact", input);
    expect(toolIdempotencyKey("run-1", "create_schedule", input)).not.toBe(base);
    expect(toolIdempotencyKey("run-1", "create_artifact", { foo: "baz" })).not.toBe(base);
  });
});

describe("isApprovedToolMatch", () => {
  it("matches only the approved tool and idempotency key", () => {
    const input = { cron: "0 11 * * *", prompt: "daily" };
    const key = toolIdempotencyKey("run-1", "create_schedule", input);
    const approved = { requestId: "req-1", toolName: "create_schedule", idempotencyKey: key };

    expect(isApprovedToolMatch(approved, "create_schedule", key)).toBe(true);
    expect(isApprovedToolMatch(approved, "create_artifact", key)).toBe(false);
    expect(
      isApprovedToolMatch(approved, "create_schedule", toolIdempotencyKey("run-1", "create_schedule", { cron: "1 1 * * *" })),
    ).toBe(false);
    expect(isApprovedToolMatch(undefined, "create_schedule", key)).toBe(false);
  });
});
