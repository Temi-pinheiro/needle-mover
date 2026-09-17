import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isAllowed } from "./server";

/** Paths reachable without a session. */
const PUBLIC_PREFIXES = [
  "/login",
  "/auth", // the OAuth callback and sign-out
  "/api/tick", // guarded by TICK_SECRET, called by pg_cron with no cookies
  "/api/webhooks", // guarded by per-workspace signature
  "/s/", // Phase 3 guest links, deliberately unauthenticated
];

const isPublic = (path: string) => PUBLIC_PREFIXES.some((p) => path.startsWith(p));

/**
 * Refreshes the auth cookie on every request and turns away anyone who is not
 * the permitted account.
 *
 * getUser() is used rather than getSession(): it revalidates against Supabase
 * instead of trusting a cookie the browser could have been handed.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => {
          toSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;

  if (!isPublic(path) && !isAllowed(user?.email)) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.search = "";
    // A signed-in but disallowed account is a different message from no session.
    if (user) login.searchParams.set("denied", "1");
    return NextResponse.redirect(login);
  }

  // Signed in already; no reason to sit on the login page.
  if (path === "/login" && isAllowed(user?.email)) {
    const home = request.nextUrl.clone();
    home.pathname = "/";
    home.search = "";
    return NextResponse.redirect(home);
  }

  return response;
}
