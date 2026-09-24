"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { notify } from "@/lib/notify";
import {
  approveCapture,
  discardCapture,
  retryCaptureAction,
  type CaptureResult,
} from "@/app/inbox/actions";
import type { CaptureSource, ProposedIssue } from "@/lib/db/types";
import type { CaptureVenture } from "@/lib/capture/resolve";
import { ArrowUpRight, Mic } from "./icons";

export type InboxItem = {
  id: string;
  source: CaptureSource;
  rawText: string | null;
  createdAt: string;
  audioUrl: string | null;
  parsed: boolean;
  proposal: ProposedIssue;
};

/**
 * The approval inbox. Each capture is approved, edited or discarded, and only
 * approval touches Linear.
 *
 * The form is always editable rather than behind an Edit button: Claude's
 * proposal is a draft by definition, and fixing a venture should cost one
 * click, not two.
 */
export function CaptureInbox({
  items,
  ventures,
  today,
  timezone,
}: {
  items: InboxItem[];
  ventures: CaptureVenture[];
  today: string;
  timezone: string;
}) {
  return (
    <div className="space-y-6">
      {items.length === 0 ? (
        <div
          className="enter rounded-xl border border-line bg-surface px-8 py-10"
          style={{ "--index": 1 } as React.CSSProperties}
        >
          <p className="editorial text-[2rem] text-ink">Nothing waiting.</p>
          <p className="mt-4 max-w-[48ch] text-[15px] leading-relaxed text-ink-muted">
            Press <kbd className="key">C</kbd> anywhere to capture something. It lands here as a
            proposed issue, and reaches Linear only once you approve it.
          </p>
        </div>
      ) : (
        items.map((item, i) => (
          <CaptureItem
            key={item.id}
            item={item}
            ventures={ventures}
            today={today}
            timezone={timezone}
            index={i + 1}
            onFiled={(result) => {
              // The item unmounts once filed, so the link to it lives in the toast.
              const url = result.url;
              toast.success(result.note ?? "Filed.", {
                action: url ? { label: "Open", onClick: () => window.open(url, "_blank", "noreferrer") } : undefined,
              });
            }}
          />
        ))
      )}
    </div>
  );
}

function CaptureItem({
  item,
  ventures,
  today,
  timezone,
  index,
  onFiled,
}: {
  item: InboxItem;
  ventures: CaptureVenture[];
  today: string;
  timezone: string;
  index: number;
  onFiled: (result: CaptureResult) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [ventureId, setVentureId] = useState(item.proposal.workspace_id ?? "");
  const [projectId, setProjectId] = useState(item.proposal.project_id ?? "");

  const projects = ventures.find((v) => v.id === ventureId)?.projects ?? [];
  const untranscribed = item.source === "voice" && !item.rawText;

  function run(action: () => Promise<CaptureResult>, onOk?: (r: CaptureResult) => void) {
    startTransition(async () => {
      const result = await action();
      if (result.ok && onOk) onOk(result);
      else notify(result);
    });
  }

  const when = new Date(item.createdAt).toLocaleString("en-GB", {
    timeZone: timezone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <article
      className="enter rounded-xl border border-line bg-surface px-6 py-7 sm:px-8"
      style={{ "--index": index } as React.CSSProperties}
    >
      <div className="mb-4 flex items-center gap-2.5 text-ink-faint">
        {item.source === "voice" && <Mic />}
        <span className="font-mono text-[11px]">{when}</span>
      </div>

      {item.rawText ? (
        <blockquote className="border-l-2 border-line-strong pl-4 text-[15px] leading-relaxed text-ink-soft">
          {item.rawText}
        </blockquote>
      ) : (
        <p className="text-sm text-ink-muted">
          {untranscribed ? "Not transcribed yet." : "No text."}
        </p>
      )}

      {item.audioUrl && (
        // The quote above is the transcript, so the clip needs no captions.
        <audio controls preload="none" src={item.audioUrl} className="mt-4 h-9 w-full" />
      )}

      {!untranscribed && (
        <form
          // onSubmit rather than `action`: React resets a form after its action
          // runs, which would wipe the edits whenever Linear refuses the issue.
          onSubmit={(e) => {
            e.preventDefault();
            const formData = new FormData(e.currentTarget);
            run(() => approveCapture(item.id, formData), onFiled);
          }}
          className="mt-6 space-y-4 border-t border-line pt-6"
        >
          {!item.parsed && (
            <p className="text-xs leading-relaxed text-pale-yellow-ink">
              Claude did not read this one. Fill it in, or ask again.
            </p>
          )}

          <label className="block">
            <span className="label">Title</span>
            <input
              name="title"
              required
              defaultValue={item.proposal.title}
              maxLength={120}
              className={field}
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block">
              <span className="label">Venture</span>
              <select
                name="workspace_id"
                required
                value={ventureId}
                onChange={(e) => {
                  setVentureId(e.target.value);
                  // A project never carries across ventures.
                  setProjectId("");
                }}
                className={field}
              >
                <option value="" disabled>
                  Choose…
                </option>
                {ventures.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="label">Project</span>
              <select
                name="project_id"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                disabled={!ventureId}
                className={field}
              >
                <option value="">None</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="label">Due</span>
              <input
                name="due_date"
                type="date"
                min={today}
                defaultValue={item.proposal.due_date ?? ""}
                className={field}
              />
            </label>
          </div>

          <label className="block">
            <span className="label">Detail</span>
            <textarea
              name="description"
              rows={2}
              defaultValue={item.proposal.description ?? ""}
              placeholder="Optional. The original note is added to the issue either way."
              className={`${field} resize-y`}
            />
          </label>

          <div className="flex flex-wrap items-center gap-2.5 pt-1">
            <button
              type="submit"
              disabled={pending}
              className="pressable flex items-center gap-2 rounded-lg bg-cta px-5 py-2.5 text-sm font-medium text-cta-ink hover:bg-cta-hover disabled:opacity-50"
            >
              {pending ? "Working…" : "Approve"}
              {!pending && <ArrowUpRight />}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => discardCapture(item.id))}
              className="pressable rounded-lg border border-btn-border bg-btn-face px-5 py-2.5 text-sm font-medium text-btn-ink hover:bg-btn-face-hover disabled:opacity-50"
            >
              Discard
            </button>
            {!item.parsed && item.rawText && (
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => retryCaptureAction(item.id))}
                className="linkish px-2 py-2.5 text-sm text-ink-muted hover:text-ink disabled:opacity-50"
              >
                Ask Claude again
              </button>
            )}
          </div>
        </form>
      )}

      {untranscribed && (
        <div className="mt-6 flex flex-wrap items-center gap-2.5 border-t border-line pt-6">
          <button
            disabled={pending}
            onClick={() => run(() => retryCaptureAction(item.id))}
            className="pressable rounded-lg bg-cta px-5 py-2.5 text-sm font-medium text-cta-ink hover:bg-cta-hover disabled:opacity-50"
          >
            {pending ? "Transcribing…" : "Transcribe again"}
          </button>
          <button
            disabled={pending}
            onClick={() => run(() => discardCapture(item.id))}
            className="pressable rounded-lg border border-btn-border bg-btn-face px-5 py-2.5 text-sm font-medium text-btn-ink hover:bg-btn-face-hover disabled:opacity-50"
          >
            Discard
          </button>
        </div>
      )}

    </article>
  );
}

const field =
  "mt-2 w-full rounded-lg border border-line bg-surface-sunken px-4 py-2.5 text-sm text-ink outline-none transition-colors duration-200 placeholder:text-ink-faint focus:border-ink disabled:opacity-50";
