import { randomBytes } from "node:crypto";

/** Time-ordered UUIDv7 (simplified; sufficient for Phase 0). */
export function newId(): string {
  const now = Date.now();
  const timeHex = now.toString(16).padStart(12, "0");
  const rand = randomBytes(10).toString("hex");
  return `${timeHex.slice(0, 8)}-${timeHex.slice(8, 12)}-7${rand.slice(0, 3)}-${rand.slice(3, 7)}-${rand.slice(7, 19)}`;
}
