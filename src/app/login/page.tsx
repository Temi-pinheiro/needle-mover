import { redirect } from "next/navigation";
import { allowedEmail, authClient, currentUser } from "@/lib/supabase/server";
import { appPath } from "@/lib/app-url";

export const dynamic = "force-dynamic";

async function signIn() {
  "use server";
  const supabase = await authClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: appPath("/auth/callback") },
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
  const configured = Boolean(allowedEmail());

  return (
    <main className="relative z-0 mx-auto flex min-h-[100dvh] w-full max-w-md items-center px-5">
      <div className="enter w-full rounded-xl border border-line bg-surface px-8 py-10">
        <p className="label mb-5">Needle Mover</p>
        <h1 className="editorial text-[2rem] text-ink">One thing that matters today.</h1>

        {denied && !configured ? (
          /*
           * Two different failures used to read identically. An unset
           * allowlist refuses everyone by design, and saying "wrong account"
           * for it sends you hunting through Google rather than your
           * deployment's environment.
           */
          <p className="mt-6 text-[15px] leading-relaxed text-pale-red-ink">
            This deployment has no <code className="font-mono text-[13px]">ALLOWED_EMAIL</code>{" "}
            set, so every sign-in is refused. Set it to your own address in the environment and
            deploy again.
          </p>
        ) : denied ? (
          <p className="mt-6 text-[15px] leading-relaxed text-pale-red-ink">
            That Google account is not the one this app is set up for. Sign in with the address
            in <code className="font-mono text-[13px]">ALLOWED_EMAIL</code>, or change it in the
            environment and deploy again.
          </p>
        ) : (
          <p className="mt-6 text-[15px] leading-relaxed text-ink-muted">
            Sign in with the Google account this workspace belongs to.
          </p>
        )}

        <form action={signIn}>
          <button
            type="submit"
            className="pressable mt-8 w-full rounded-lg bg-cta px-5 py-3 text-sm font-medium text-cta-ink hover:bg-cta-hover"
          >
            Continue with Google
          </button>
        </form>
      </div>
    </main>
  );
}
