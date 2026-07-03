import { describe, expect, it } from "vitest";
import { canAcquireSpaceSandboxLease } from "./space-sandboxes";

describe("canAcquireSpaceSandboxLease", () => {
  const now = new Date("2026-07-03T12:00:00.000Z");

  it("allows an idle sandbox session to be leased", () => {
    expect(
      canAcquireSpaceSandboxLease(
        { activeRunId: null, leaseExpiresAt: null },
        { runId: "run-1", now },
      ),
    ).toBe(true);
  });

  it("allows the active run to reacquire its own lease", () => {
    expect(
      canAcquireSpaceSandboxLease(
        {
          activeRunId: "run-1",
          leaseExpiresAt: new Date("2026-07-03T12:05:00.000Z"),
        },
        { runId: "run-1", now },
      ),
    ).toBe(true);
  });

  it("blocks a different run while the lease is still fresh", () => {
    expect(
      canAcquireSpaceSandboxLease(
        {
          activeRunId: "run-1",
          leaseExpiresAt: new Date("2026-07-03T12:05:00.000Z"),
        },
        { runId: "run-2", now },
      ),
    ).toBe(false);
  });

  it("allows stale leases to be recovered by another run", () => {
    expect(
      canAcquireSpaceSandboxLease(
        {
          activeRunId: "run-1",
          leaseExpiresAt: new Date("2026-07-03T11:59:59.000Z"),
        },
        { runId: "run-2", now },
      ),
    ).toBe(true);
  });
});
