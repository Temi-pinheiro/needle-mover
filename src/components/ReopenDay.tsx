"use client";

import { useState, useTransition } from "react";
import { reopenToday } from "@/app/actions";
import { notify } from "@/lib/notify";

/**
 * Getting back to the Now view after closing.
 *
 * Sits quietly at the foot of the recap rather than beside the summary: the
 * common case is reading the day and leaving, not undoing it.
 */
export function ReopenDay({ recapWasSent }: { recapWasSent: boolean }) {
  const [armed, setArmed] = useState(false);
  const [pending, start] = useTransition();

  if (!armed) {
    return (
      <button
        onClick={() => setArmed(true)}
        className="pressable rounded-lg border border-btn-border bg-btn-face px-4 py-2 text-[13px] font-medium text-btn-ink hover:bg-btn-face-hover"
      >
        Reopen the day
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        disabled={pending}
        onClick={() =>
          start(async () => notify(await reopenToday()))
        }
        className="pressable rounded-lg bg-cta px-4 py-2 text-[13px] font-medium text-cta-ink hover:bg-cta-hover disabled:opacity-50"
      >
        {pending ? "Reopening…" : "Yes, reopen"}
      </button>
      <button
        onClick={() => setArmed(false)}
        disabled={pending}
        className="pressable px-2 py-2 text-[13px] text-ink-muted transition-colors hover:text-ink"
      >
        Cancel
      </button>
      <span className="text-[12px] leading-relaxed text-ink-faint">
        {recapWasSent
          ? "What you did today is kept. The recap is rewritten on the next close, and a corrected one is sent."
          : "What you did today is kept. The recap is rewritten on the next close."}
      </span>
    </div>
  );
}
