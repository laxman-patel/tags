import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifySlackSignature } from "./verify";

function sign(secret: string, body: string, timestamp: string): string {
  const base = `v0:${timestamp}:${body}`;
  const hmac = createHmac("sha256", secret).update(base).digest("hex");
  return `v0=${hmac}`;
}

describe("verifySlackSignature", () => {
  const secret = "test-secret";
  const body = '{"type":"event_callback"}';
  const timestamp = String(Math.floor(Date.now() / 1000));

  it("accepts a valid signature", () => {
    const signature = sign(secret, body, timestamp);
    expect(verifySlackSignature(secret, body, timestamp, signature)).toBe(true);
  });

  it("rejects tampered body", () => {
    const signature = sign(secret, body, timestamp);
    expect(verifySlackSignature(secret, `${body}x`, timestamp, signature)).toBe(false);
  });

  it("rejects stale timestamps", () => {
    const oldTs = String(Math.floor(Date.now() / 1000) - 600);
    const signature = sign(secret, body, oldTs);
    expect(verifySlackSignature(secret, body, oldTs, signature)).toBe(false);
  });
});
