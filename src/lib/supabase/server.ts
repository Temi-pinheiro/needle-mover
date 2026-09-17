import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Request-scoped Supabase client for the signed-in user.
 *
 * Distinct from lib/db/client.ts, which holds the service role and does the
 * app's actual work. This one exists only to answer "who is this, and are they
 * allowed in" — it never reads application data.
 */
export async function authClient() {
  const store = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll: (toSet) => {
          try {
            toSet.forEach(({ name, value, options }) => store.set(name, value, options));
          } catch {
            // Called from a Server Component, where cookies are read-only.
            // Middleware refreshes the session, so this is safe to swallow.
          }
        },
      },
    },
  );
}

/** The single address permitted to sign in. */
export function allowedEmail(): string | null {
  return process.env.ALLOWED_EMAIL?.trim().toLowerCase() || null;
}

export function isAllowed(email: string | null | undefined): boolean {
  const allowed = allowedEmail();
  // No allowlist configured is a misconfiguration, not an open door.
  if (!allowed) return false;
  return email?.trim().toLowerCase() === allowed;
}

/** The signed-in, permitted user — or null. */
export async function currentUser() {
  const supabase = await authClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user && isAllowed(user.email) ? user : null;
}
