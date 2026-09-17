import { redirect } from "next/navigation";
import { authClient, currentUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

async function signIn() {
  "use server";
  const supabase = await authClient();
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${origin}/auth/callback` },
  });

  if (error) throw new Error(error.message);
  if (data.url) redirect(data.url);
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ denied?: string }>;
}) {
  if (await currentUser()) redirect("/");
  const denied = (await searchParams).denied === "1";

  return (
    <main className="relative z-0 mx-auto flex min-h-[100dvh] w-full max-w-md items-center px-5">
      <div className="enter w-full rounded-xl border border-line bg-surface px-8 py-10">
        <p className="label mb-5">Needle Mover</p>
        <h1 className="editorial text-[2rem] text-ink">One thing that matters today.</h1>

        {denied ? (
          <p className="mt-6 text-[15px] leading-relaxed text-pale-red-ink">
            That account is not the one this app is set up for. Sign in with the address in
            ALLOWED_EMAIL, or change it and restart the server.
          </p>
        ) : (
          <p className="mt-6 text-[15px] leading-relaxed text-ink-muted">
            Sign in with the Google account this workspace belongs to.
          </p>
        )}

        <form action={signIn}>
          <button
            type="submit"
            className="pressable mt-8 w-full rounded-md bg-cta px-5 py-3 text-sm font-medium text-cta-ink hover:bg-cta-hover"
          >
            Continue with Google
          </button>
        </form>
      </div>
    </main>
  );
}
