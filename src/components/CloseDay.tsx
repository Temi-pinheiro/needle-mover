"use client";

import { useState, useTransition } from "react";
import { closeToday } from "@/app/actions";

/**
 * Closing is deliberate and not undoable from the UI, so it asks once. It also
 * takes a few seconds — sync, snapshot, a Claude call and an email — which the
 * label says rather than leaving the page looking stuck.
 */
export function CloseDay() {
  const [armed, setArmed] = useState(false);
  const [pending, start] = useTransition();
  const [note, setNote] = useState<string | null>(null);

  if (note) {
    return (
      <p role="status" className="py-4 text-[13px] text-ink-muted">
        {note}
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3 py-4">
      {armed ? (
        <>
          <button
            disabled={pending}
            onClick={() => start(async () => setNote((await closeToday()).note ?? "Day closed. Recap sent."))}
            className="pressable rounded-lg bg-cta px-5 py-2.5 text-sm font-medium text-cta-ink hover:bg-cta-hover disabled:opacity-50"
          >
            {pending ? "Writing the recap…" : "Yes, close it"}
          </button>
          <button
            onClick={() => setArmed(false)}
            disabled={pending}
            className="pressable px-3 py-2.5 text-sm text-ink-muted transition-colors hover:text-ink"
          >
            Not yet
          </button>
          <span className="text-[12px] text-ink-faint">
            Snapshots progress, writes the recap and emails it.
          </span>
        </>
      ) : (
        <button
          onClick={() => setArmed(true)}
          className="pressable rounded-lg border border-btn-border bg-btn-face px-4 py-2 text-[13px] font-medium text-btn-ink hover:bg-btn-face-hover"
        >
          Close the day
        </button>
      )}
    </div>
  );
}
