import { beforeAll, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { decrypt, encrypt, safeEqual, shareToken } from "./crypto";

beforeAll(() => {
  process.env.ENCRYPTION_KEY = randomBytes(32).toString("base64");
});

describe("encrypt/decrypt", () => {
  it("round-trips a Linear API key", () => {
    const secret = "lin_api_" + "x".repeat(40);
    expect(decrypt(encrypt(secret))).toBe(secret);
  });

  it("produces a different ciphertext each time", () => {
    expect(encrypt("same")).not.toBe(encrypt("same"));
  });

  it("rejects a tampered payload", () => {
    const payload = encrypt("secret");
    const [v, iv, tag, ct] = payload.split(".");
    const flipped = Buffer.from(ct, "base64");
    flipped[0] ^= 0xff;
    expect(() => decrypt([v, iv, tag, flipped.toString("base64")].join("."))).toThrow();
  });

  it("rejects a malformed payload", () => {
    expect(() => decrypt("not-a-payload")).toThrow(/Malformed/);
  });

  it("rejects a key of the wrong length", () => {
    const good = process.env.ENCRYPTION_KEY;
    process.env.ENCRYPTION_KEY = randomBytes(16).toString("base64");
    expect(() => encrypt("x")).toThrow(/32 bytes/);
    process.env.ENCRYPTION_KEY = good;
  });
});

describe("safeEqual", () => {
  it("compares without throwing on length mismatch", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abcd")).toBe(false);
    expect(safeEqual("abc", "abd")).toBe(false);
  });
});

describe("shareToken", () => {
  it("is url-safe and long enough to be unguessable", () => {
    const t = shareToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(t.length).toBeGreaterThanOrEqual(43);
  });
});
