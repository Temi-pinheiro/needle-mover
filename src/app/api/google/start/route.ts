import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { consentUrl } from "@/lib/google/client";

export const dynamic = "force-dynamic";

export const STATE_COOKIE = "nm_google_state";

/**
 * Begins the Calendar grant. Deliberately separate from sign-in: Supabase's
 * Google provider only surfaces a refresh token on the very first consent, so
 * owning this flow is what keeps calendar access from expiring after one
 * re-login.
 */
export async function GET() {
  const state = randomBytes(24).toString("base64url");
  const response = NextResponse.redirect(consentUrl(state));

  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax", // must survive the redirect back from Google
    path: "/",
    maxAge: 600,
  });

  return response;
}
