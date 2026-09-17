import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verifying a Linear webhook.
 *
 * Linear signs the raw request body with HMAC-SHA256 using the per-webhook
 * secret and sends it as `Linear-Signature`. The body must be verified exactly
 * as received — parsing and re-serialising it changes the bytes and the
 * signature will not match.
 */

/** Deliveries older than this are refused, so a captured request cannot be replayed. */
export const MAX_AGE_MS = 60_000;

export function signatureFor(rawBody: string, secret: string): string {
  return createHmac("sha256", secret).update(rawBody).digest("hex");
}

export function verifySignature(rawBody: string, secret: string, presented: string): boolean {
  const expected = signatureFor(rawBody, secret);
  if (presented.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(expected, "utf8"), Buffer.from(presented, "utf8"));
}

export type WebhookPayload = {
  action?: string;
  type?: string;
  webhookTimestamp?: number;
  data?: Record<string, unknown>;
};

export type VerifyResult =
  | { ok: true; payload: WebhookPayload }
  | { ok: false; reason: string };

export function verifyDelivery(
  rawBody: string,
  secret: string,
  presented: string | null,
  now = Date.now(),
): VerifyResult {
  if (!presented) return { ok: false, reason: "no signature header" };
  if (!verifySignature(rawBody, secret, presented)) return { ok: false, reason: "bad signature" };

  let payload: WebhookPayload;
  try {
    payload = JSON.parse(rawBody) as WebhookPayload;
  } catch {
    return { ok: false, reason: "body is not JSON" };
  }

  // Linear's own guidance: reject anything older than a minute.
  if (typeof payload.webhookTimestamp === "number") {
    if (Math.abs(now - payload.webhookTimestamp) > MAX_AGE_MS) {
      return { ok: false, reason: "delivery is too old" };
    }
  }

  return { ok: true, payload };
}
