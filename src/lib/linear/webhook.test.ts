import { describe, expect, it } from "vitest";
import { MAX_AGE_MS, signatureFor, verifyDelivery, verifySignature } from "./webhook";

const SECRET = "lin_wh_test_secret";
const now = 1_775_000_000_000;

const body = (over: Record<string, unknown> = {}) =>
  JSON.stringify({ action: "update", type: "Issue", webhookTimestamp: now, ...over });

describe("verifySignature", () => {
  it("accepts a signature over the exact bytes received", () => {
    const raw = body();
    expect(verifySignature(raw, SECRET, signatureFor(raw, SECRET))).toBe(true);
  });

  it("rejects a signature made with a different secret", () => {
    const raw = body();
    expect(verifySignature(raw, SECRET, signatureFor(raw, "other-secret"))).toBe(false);
  });

  it("rejects when the body has been altered by a single byte", () => {
    const raw = body();
    const signature = signatureFor(raw, SECRET);
    expect(verifySignature(raw.replace('"update"', '"remove"'), SECRET, signature)).toBe(false);
  });

  it("rejects a re-serialised body, since the bytes differ", () => {
    // The guard against parsing before verifying: same object, different bytes.
    const raw = body();
    const reserialised = JSON.stringify(JSON.parse(raw), null, 2);
    expect(verifySignature(reserialised, SECRET, signatureFor(raw, SECRET))).toBe(false);
  });

  it("rejects a signature of the wrong length without throwing", () => {
    expect(verifySignature(body(), SECRET, "abc")).toBe(false);
  });
});

describe("verifyDelivery", () => {
  it("accepts a fresh, correctly signed delivery", () => {
    const raw = body();
    const result = verifyDelivery(raw, SECRET, signatureFor(raw, SECRET), now);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.payload.type).toBe("Issue");
  });

  it("refuses a missing signature header", () => {
    const raw = body();
    expect(verifyDelivery(raw, SECRET, null, now)).toEqual({ ok: false, reason: "no signature header" });
  });

  it("refuses a replayed delivery", () => {
    const stale = body({ webhookTimestamp: now - MAX_AGE_MS - 1 });
    const result = verifyDelivery(stale, SECRET, signatureFor(stale, SECRET), now);
    expect(result).toEqual({ ok: false, reason: "delivery is too old" });
  });

  it("accepts a delivery right at the age limit", () => {
    const edge = body({ webhookTimestamp: now - MAX_AGE_MS });
    expect(verifyDelivery(edge, SECRET, signatureFor(edge, SECRET), now).ok).toBe(true);
  });

  it("refuses a body that is signed but not JSON", () => {
    const raw = "not json";
    expect(verifyDelivery(raw, SECRET, signatureFor(raw, SECRET), now)).toEqual({
      ok: false,
      reason: "body is not JSON",
    });
  });

  it("accepts a delivery with no timestamp rather than guessing its age", () => {
    const raw = JSON.stringify({ action: "create", type: "Issue" });
    expect(verifyDelivery(raw, SECRET, signatureFor(raw, SECRET), now).ok).toBe(true);
  });
});
