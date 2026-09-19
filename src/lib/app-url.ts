/**
 * The app's own origin, normalised.
 *
 * Every caller builds a URL by appending a path, so a configured value with a
 * trailing slash produces `https://host//auth/callback`. That is not merely
 * ugly: OAuth providers match redirect URIs as exact strings, so the doubled
 * slash is a different URI and the sign-in is rejected.
 *
 * Pasting a URL with a trailing slash is the normal thing to do — browsers add
 * one, and so do most dashboards. Tolerating it here is cheaper than expecting
 * everyone who self-hosts this to notice.
 */
const FALLBACK = "http://localhost:3000";

export function appUrl(): string {
  const raw = (process.env.NEXT_PUBLIC_APP_URL ?? FALLBACK).trim();
  return raw.replace(/\/+$/, "") || FALLBACK;
}

/** `appPath("/login")` and `appPath("login")` both produce one slash. */
export function appPath(path: string): string {
  return `${appUrl()}/${path.replace(/^\/+/, "")}`;
}
