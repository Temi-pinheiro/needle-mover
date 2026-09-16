import { OAuth2Client } from "google-auth-library";
import { isValidTimezone } from "@/lib/time";
import type { Interval } from "./freebusy";

/**
 * Google Calendar access.
 *
 * This is a separate OAuth grant from sign-in on purpose. Supabase's Google
 * provider only surfaces a refresh token on the very first consent, so a
 * single re-login would cost us calendar access permanently. Owning the grant
 * means owning the refresh token.
 *
 * Calls go through fetch rather than the `googleapis` package — we need two
 * endpoints, and that package is enormous.
 */

const CALENDAR_API = "https://www.googleapis.com/calendar/v3";

export const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";

export function oauthClient(): OAuth2Client {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, NEXT_PUBLIC_APP_URL } = process.env;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    throw new Error("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set.");
  }
  return new OAuth2Client({
    clientId: GOOGLE_CLIENT_ID,
    clientSecret: GOOGLE_CLIENT_SECRET,
    redirectUri: `${NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/google/callback`,
  });
}

/**
 * `access_type: offline` plus `prompt: consent` is what guarantees a refresh
 * token comes back. Without the forced prompt, Google omits it on every
 * consent after the first, which is the exact failure we moved off Supabase
 * Auth to avoid.
 */
export function consentUrl(): string {
  return oauthClient().generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [CALENDAR_SCOPE],
  });
}

export async function exchangeCode(code: string): Promise<{ refreshToken: string }> {
  const { tokens } = await oauthClient().getToken(code);
  if (!tokens.refresh_token) {
    throw new Error(
      "Google did not return a refresh token. Revoke the app at myaccount.google.com/permissions and connect again.",
    );
  }
  return { refreshToken: tokens.refresh_token };
}

async function accessToken(refreshToken: string): Promise<string> {
  const client = oauthClient();
  client.setCredentials({ refresh_token: refreshToken });
  const { token } = await client.getAccessToken();
  if (!token) throw new Error("Could not refresh the Google access token.");
  return token;
}

async function call<T>(refreshToken: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${CALENDAR_API}${path}`, {
    ...init,
    headers: {
      ...init?.headers,
      Authorization: `Bearer ${await accessToken(refreshToken)}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Google Calendar ${path} returned ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as T;
}

/**
 * The timezone of the primary calendar. This is the single source of truth for
 * where TP is, refreshed on each tick, so travel needs no settings change.
 */
export async function primaryTimezone(refreshToken: string): Promise<string | null> {
  const data = await call<{ timeZone?: string }>(refreshToken, "/calendars/primary");
  if (!data.timeZone || !isValidTimezone(data.timeZone)) return null;
  return data.timeZone;
}

/** Busy intervals across the primary calendar between two instants. */
export async function busyIntervals(
  refreshToken: string,
  timeMin: Date,
  timeMax: Date,
): Promise<Interval[]> {
  const data = await call<{
    calendars?: Record<string, { busy?: Interval[]; errors?: Array<{ reason: string }> }>;
  }>(refreshToken, "/freeBusy", {
    method: "POST",
    body: JSON.stringify({
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      items: [{ id: "primary" }],
    }),
  });

  const primary = data.calendars?.primary;
  if (primary?.errors?.length) {
    throw new Error(`freeBusy error: ${primary.errors.map((e) => e.reason).join(", ")}`);
  }
  return primary?.busy ?? [];
}
