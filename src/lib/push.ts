import webpush from "web-push";
import { db } from "@/lib/db/client";
import { localInstant, localTime } from "@/lib/time";

/**
 * Browser push, for the one midday nudge.
 *
 * Works in desktop Chrome, Edge, Firefox and Safari without installing
 * anything, which is the point — this is a laptop-first app and a native
 * shell would be a lot of machinery for one notification a day.
 */

export type StoredSubscription = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

let configured = false;

function configure(): boolean {
  if (configured) return true;

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) return false;

  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  return true;
}

/**
 * Sends to every stored subscription.
 *
 * A 404 or 410 means the browser has thrown the subscription away — that
 * endpoint is deleted rather than retried forever.
 */
export async function pushToAll(payload: {
  title: string;
  body: string;
  url: string;
}): Promise<{ sent: number; removed: number; failed: number }> {
  if (!configure()) return { sent: 0, removed: 0, failed: 0 };

  const subscriptions = ((await db().from("push_subscriptions").select("*")).data ??
    []) as StoredSubscription[];

  let sent = 0;
  let removed = 0;
  let failed = 0;

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload),
        );
        sent++;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await db().from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
          removed++;
        } else {
          failed++;
        }
      }
    }),
  );

  return { sent, removed, failed };
}

export async function subscriptionCount(): Promise<number> {
  const { count } = await db()
    .from("push_subscriptions")
    .select("endpoint", { count: "exact", head: true });
  return count ?? 0;
}

/**
 * Midday, defined as halfway between the brief and the cutoff rather than a
 * fixed 12:00 — someone who starts at 05:00 and stops at 15:00 does not have
 * the same midday as someone who starts at 09:00.
 */
export function middayTime(briefTime: string, cutoffTime: string): string {
  const minutes = (t: string) => {
    const [h, m] = t.slice(0, 5).split(":").map(Number);
    return h * 60 + m;
  };

  const start = minutes(briefTime);
  const end = minutes(cutoffTime);
  if (end <= start) return "13:00";

  const mid = Math.round((start + end) / 2);
  return `${String(Math.floor(mid / 60)).padStart(2, "0")}:${String(mid % 60).padStart(2, "0")}`;
}

/** The instant midday falls at, on a given local date. */
export function middayInstant(
  date: string,
  timezone: string,
  briefTime: string,
  cutoffTime: string,
): Date {
  return localInstant(date, middayTime(briefTime, cutoffTime), timezone);
}

export { localTime };
