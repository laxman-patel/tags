import { createHmac, timingSafeEqual } from "node:crypto";

const MAX_AGE_SECONDS = 60 * 5;

export function verifySlackSignature(
  signingSecret: string,
  rawBody: string,
  timestamp: string,
  signature: string,
): boolean {
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (age > MAX_AGE_SECONDS) return false;

  const base = `v0:${timestamp}:${rawBody}`;
  const hmac = createHmac("sha256", signingSecret).update(base).digest("hex");
  const computed = `v0=${hmac}`;

  if (computed.length !== signature.length) return false;

  try {
    return timingSafeEqual(Buffer.from(computed), Buffer.from(signature));
  } catch {
    return false;
  }
}
