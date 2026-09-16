"use client";

import { useState, useTransition } from "react";
import type { ActionResult } from "@/app/actions";
import { ArrowUpRight } from "./icons";

/**
 * The empty and not-yet-set-up states. Same double-bezel language as the card,
 * because a first run should not look like an error page.
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
    <main className="relative z-0 mx-auto flex min-h-[100dvh] w-full max-w-[680px] items-center px-5 py-14 sm:px-8">
      <div className="rise w-full rounded-[2rem] bg-ground-deep p-1.5 ring-1 ring-hairline">
        <div
          className="rounded-[calc(2rem-0.375rem)] bg-surface px-8 py-10 sm:px-11 sm:py-12"
          style={{ boxShadow: "var(--lift), var(--inner-light)" }}
        >
          <p className="label mb-4">{eyebrow}</p>
          <h1 className="font-display text-[2.1rem] leading-[1.1] tracking-[-0.015em] text-ink sm:text-[2.6rem]">
            {title}
          </h1>
          <p className="mt-5 max-w-[46ch] text-[15px] leading-relaxed text-ink-muted">{body}</p>

          {action && (
            <button
              onClick={() =>
                startTransition(async () => setNote((await action.run()).note ?? null))
              }
              disabled={pending}
              className="pressable lift-on-hover group mt-8 flex items-center gap-3 rounded-full bg-accent py-2.5 pl-6 pr-2.5 text-sm font-medium text-accent-ink disabled:opacity-60"
            >
              {pending ? "Working…" : action.label}
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] group-hover:scale-105">
                <ArrowUpRight />
              </span>
            </button>
          )}

          {note && (
            <p role="status" className="mt-5 text-xs leading-relaxed text-warn">
              {note}
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
