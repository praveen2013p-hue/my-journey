import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { decryptToken, encryptToken } from "./token-encryption";

const ORIGINAL_KEY = process.env.TOKEN_ENC_KEY;

beforeEach(() => {
  process.env.TOKEN_ENC_KEY = "test-token-encryption-key-at-least-32-chars";
});

afterEach(() => {
  process.env.TOKEN_ENC_KEY = ORIGINAL_KEY;
});

describe("encryptToken / decryptToken", () => {
  it("round-trips a plaintext token", async () => {
    const encrypted = await encryptToken("a-real-kite-access-token");
    expect(encrypted).not.toContain("a-real-kite-access-token");
    expect(await decryptToken(encrypted)).toBe("a-real-kite-access-token");
  });

  it("produces a different ciphertext each time (random IV)", async () => {
    const a = await encryptToken("same-token");
    const b = await encryptToken("same-token");
    expect(a).not.toBe(b);
  });

  it("fails to decrypt with the wrong key", async () => {
    const encrypted = await encryptToken("a-real-kite-access-token");
    process.env.TOKEN_ENC_KEY = "a-totally-different-encryption-key-value";
    await expect(decryptToken(encrypted)).rejects.toThrow();
  });

  it("throws on a malformed stored value instead of silently returning garbage", async () => {
    await expect(decryptToken("not-the-right-shape")).rejects.toThrow();
  });
});
