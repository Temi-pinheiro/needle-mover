import { NextResponse } from "next/server";
import { authClient, isAllowed } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const appUrl = () => process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

/** Exchanges the OAuth code for a session, then enforces the allowlist. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const code = params.get("code");

  if (params.get("error") || !code) {
    return NextResponse.redirect(`${appUrl()}/login`);
  }

  const supabase = await authClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(`${appUrl()}/login`);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // A valid Google account that is not the permitted one gets its session
  // torn down here rather than left alive for middleware to keep rejecting.
  if (!isAllowed(user?.email)) {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${appUrl()}/login?denied=1`);
  }

  return NextResponse.redirect(appUrl());
}
