import { beforeEach, describe, expect, it } from "vitest";
import { createSessionCookieValue, verifySessionCookieValue } from "./session";

beforeEach(() => {
  process.env.MOCK_AUTH_SECRET = "test-mock-auth-secret";
});

describe("mock session cookie", () => {
  it("round-trips a valid cookie back to its email", async () => {
    const cookie = await createSessionCookieValue("praveen@example.com");
    const payload = await verifySessionCookieValue(cookie);
    expect(payload?.email).toBe("praveen@example.com");
  });

  it("rejects a tampered payload even with the original signature", async () => {
    const cookie = await createSessionCookieValue("praveen@example.com");
    const [payloadB64, signatureB64] = cookie.split(".");
    const tampered = `${payloadB64}x.${signatureB64}`;
    expect(await verifySessionCookieValue(tampered)).toBeNull();
  });

  it("rejects a cookie signed with a different secret", async () => {
    const cookie = await createSessionCookieValue("praveen@example.com");
    process.env.MOCK_AUTH_SECRET = "a-different-secret";
    expect(await verifySessionCookieValue(cookie)).toBeNull();
  });

  it("rejects missing or malformed values without throwing", async () => {
    expect(await verifySessionCookieValue(undefined)).toBeNull();
    expect(await verifySessionCookieValue("")).toBeNull();
    expect(await verifySessionCookieValue("no-dot-in-here")).toBeNull();
    expect(await verifySessionCookieValue("garbage.garbage")).toBeNull();
  });
});
