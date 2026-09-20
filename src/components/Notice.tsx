"use client";

import { useState, useTransition } from "react";
import type { ActionResult } from "@/app/actions";

/**
 * Empty and not-yet-set-up states, in the same flat hairline language as the
 * card — a first run should not look like an error page.
 */
export function Notice({
  eyebrow,
  title,
  body,
  action,
}: {
  eyebrow: string;
  title: string;
  body: string;
  action?: { label: string; run: () => Promise<ActionResult> };
}) {
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState<string | null>(null);

  return (
    <main className="relative z-0 mx-auto flex min-h-[100dvh] w-full max-w-2xl items-center px-5 py-16 sm:px-8">
      <div className="enter w-full rounded-xl border border-line bg-surface px-8 py-10 sm:px-11 sm:py-12">
        <p className="label mb-5">{eyebrow}</p>
        <h1 className="editorial text-[2rem] text-ink sm:text-[2.5rem]">{title}</h1>
        <p className="mt-6 max-w-[52ch] text-[15px] leading-relaxed text-ink-muted">{body}</p>

        {action && (
          <button
            onClick={() => startTransition(async () => setNote((await action.run()).note ?? null))}
            disabled={pending}
            className="pressable mt-9 rounded-lg bg-cta px-5 py-2.5 text-sm font-medium text-cta-ink hover:bg-cta-hover disabled:opacity-50"
          >
            {pending ? "Working…" : action.label}
          </button>
        )}

        {note && (
          <p role="status" className="mt-5 text-xs leading-relaxed text-pale-yellow-ink">
            {note}
          </p>
        )}
      </div>
    </main>
  );
}
