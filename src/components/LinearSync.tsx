"use client";

import { useState, useTransition } from "react";
import { repickToday, syncNow, type SettingsResult } from "@/app/settings/actions";

/**
 * Two actions that are easy to confuse, so the labels do the explaining.
 *
 * Syncing refreshes what the app knows about Linear. Re-picking decides the
 * day again from that. Reshuffling priorities in Linear needs both, and only
 * the second costs a Claude call.
 */
export function LinearSync({ plannedToday }: { plannedToday: boolean }) {
  const [pending, start] = useTransition();
  const [running, setRunning] = useState<"sync" | "repick" | null>(null);
  const [result, setResult] = useState<SettingsResult | null>(null);

  function run(which: "sync" | "repick", action: () => Promise<SettingsResult>) {
    setRunning(which);
    setResult(null);
    start(async () => {
      setResult(await action());
      setRunning(null);
    });
  }

  return (
    <div className="space-y-6">
      <Row
        title="Sync from Linear"
        body="Pulls the current issues, projects and target dates. Use it after changing things in Linear. It does not change what today shows."
        label={running === "sync" ? "Syncing…" : "Sync"}
        disabled={pending}
        onClick={() => run("sync", syncNow)}
      />

      <div className="h-px w-full bg-line" />

      <Row
        title="Re-pick today"
        body={
          plannedToday
            ? "Syncs, then ranks again and asks Claude to choose. Replaces today's tasks. What you already started or finished is kept."
            : "Nothing has been picked today yet. This syncs and chooses."
        }
        label={running === "repick" ? "Thinking…" : "Re-pick"}
        disabled={pending}
        onClick={() => run("repick", repickToday)}
      />

      {result && (
        <p
          role="status"
          className={`text-[13px] leading-relaxed ${
            result.ok ? "text-pale-green-ink" : "text-pale-red-ink"
          }`}
        >
          {result.note}
        </p>
      )}
    </div>
  );
}

function Row({
  title,
  body,
  label,
  disabled,
  onClick,
}: {
  title: string;
  body: string;
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0 flex-1">
        <p className="text-[15px] text-ink">{title}</p>
        <p className="mt-1.5 max-w-[56ch] text-[13px] leading-relaxed text-ink-muted">{body}</p>
      </div>
      <button
        onClick={onClick}
        disabled={disabled}
        className="pressable shrink-0 rounded-lg border border-btn-border bg-btn-face px-5 py-2.5 text-sm font-medium text-btn-ink hover:bg-btn-face-hover disabled:opacity-50"
      >
        {label}
      </button>
    </div>
  );
}
