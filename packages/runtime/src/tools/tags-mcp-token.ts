import { createHmac, timingSafeEqual } from "node:crypto";

export type TagsMcpRunClaims = {
  runId: string;
  organizationId: string;
  workspaceId: string;
  spaceId: string;
  channelId: string;
  threadId: string;
  actorSlackUserId: string;
  enabledTools: string[];
  exp: number;
};

function base64UrlEncode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signPayload(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createTagsMcpRunToken(
  claims: Omit<TagsMcpRunClaims, "exp">,
  secret: string,
  ttlMs = 30 * 60_000,
): string {
  const payload = base64UrlEncode(
    JSON.stringify({
      ...claims,
      exp: Date.now() + ttlMs,
    } satisfies TagsMcpRunClaims),
  );
  return `${payload}.${signPayload(payload, secret)}`;
}

export function verifyTagsMcpRunToken(
  token: string,
  secret: string,
): TagsMcpRunClaims | null {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  const expected = signPayload(payload, secret);
  const actual = Buffer.from(signature);
  const expectedBuf = Buffer.from(expected);
  if (actual.length !== expectedBuf.length || !timingSafeEqual(actual, expectedBuf)) {
    return null;
  }

  try {
    const claims = JSON.parse(base64UrlDecode(payload)) as TagsMcpRunClaims;
    if (
      !claims.runId ||
      !claims.organizationId ||
      !claims.workspaceId ||
    !claims.spaceId ||
    !claims.channelId ||
    !claims.threadId ||
      !Array.isArray(claims.enabledTools) ||
      typeof claims.exp !== "number"
    ) {
      return null;
    }
    if (claims.exp < Date.now()) return null;
    return claims;
  } catch {
    return null;
  }
}
