import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, parseSecretBoxKey } from "./secret-box";

describe("secret-box", () => {
  const key = randomBytes(32).toString("base64");

  it("encrypts and decrypts AES-256-GCM ciphertext", () => {
    const ciphertext = encryptSecret("xoxb-secret-token", key);

    expect(ciphertext.startsWith("v1:")).toBe(true);
    expect(ciphertext).not.toContain("xoxb-secret-token");
    expect(decryptSecret(ciphertext, key)).toBe("xoxb-secret-token");
  });

  it("rejects keys that are not 32 bytes after base64 decoding", () => {
    expect(() => parseSecretBoxKey(Buffer.from("short").toString("base64"))).toThrow(
      /32-byte key/,
    );
  });
});
