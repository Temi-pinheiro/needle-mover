import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { encrypt, safeEqual } from "@/lib/crypto";
import { exchangeCode, primaryCalendar } from "@/lib/google/client";
import { STATE_COOKIE } from "../start/route";

export const dynamic = "force-dynamic";

const appUrl = () => process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

/** Setup-flow failures are shown, not redirected away — you need to read them. */
function problem(message: string, detail?: string) {
  return new Response(
    `Google Calendar was not connected.\n\n${message}\n${detail ? `\n${detail}\n` : ""}`,
    { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8" } },
  );
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;

  const denied = params.get("error");
  if (denied) {
    return problem(
      `Google returned "${denied}".`,
      denied === "access_denied"
        ? "You declined the consent screen, or the account is outside the Workspace this OAuth client is restricted to."
        : undefined,
    );
  }

  const code = params.get("code");
  if (!code) return problem("Google did not send an authorisation code.");

  // The state cookie is what makes a callback we did not initiate unusable.
  const expected = request.headers
    .get("cookie")
    ?.split("; ")
    .find((c) => c.startsWith(`${STATE_COOKIE}=`))
    ?.split("=")[1];
  const presented = params.get("state");

  if (!expected || !presented || !safeEqual(presented, expected)) {
    return problem(
      "The state parameter did not match.",
      "Start the flow again from /api/google/start rather than reusing an old link.",
    );
  }

  try {
    const { refreshToken } = await exchangeCode(code);
    const { email, timezone } = await primaryCalendar(refreshToken);

    await db()
      .from("google_accounts")
      .upsert(
        {
          singleton: true,
          email,
          refresh_token: encrypt(refreshToken),
          primary_calendar_id: "primary",
          timezone,
          connected_at: new Date().toISOString(),
        },
        { onConflict: "singleton" },
      );

    // The calendar is the source of truth for where TP is, so adopt it now
    // rather than waiting for the next tick.
    if (timezone) {
      await db().from("settings").update({ timezone }).eq("singleton", true);
    }

    const response = NextResponse.redirect(appUrl());
    response.cookies.delete(STATE_COOKIE);
    return response;
  } catch (err) {
    return problem(
      "The token exchange failed.",
      err instanceof Error ? err.message : String(err),
    );
  }
}
