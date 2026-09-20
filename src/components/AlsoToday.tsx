"use client";

import { useState, useTransition } from "react";
import { Check } from "@phosphor-icons/react/dist/ssr/Check";
import { completeTask, startTask, type ActionResult } from "@/app/actions";

export type AlsoTodayItem = {
  id: string;
  identifier: string;
  title: string;
  url: string | null;
  ventureName: string;
  reason: string;
  started: boolean;
  done: boolean;
};

/**
 * What to turn to once the needle mover is finished.
 *
 * Deliberately not a queue: the day still has one needle mover, and finishing
 * it does not promote the next thing. But a passive list of titles sends you
 * back to Linear to re-decide, which is the work this app exists to remove, so
 * each row carries its reason and can be started here.
 *
 * Nothing collapses. The day is one task plus at most three, which is never
 * enough content to be worth hiding — a disclosure that saves four rows costs
 * a click and a decision to buy nothing.
 */
export function AlsoToday({ dayId, items }: { dayId: string; items: AlsoTodayItem[] }) {
  if (items.length === 0) return null;

  const remaining = items.filter((i) => !i.done).length;

  return (
    <section className="enter mt-8" style={{ "--index": 3 } as React.CSSProperties}>
      <header className="flex items-baseline justify-between border-b border-line pb-3">
        <h2 className="label">Then</h2>
        <span className="font-mono text-[11px] tabular-nums text-ink-faint">
          {remaining === items.length ? items.length : `${remaining} of ${items.length}`}
        </span>
      </header>

      <ul className="divide-y divide-line">
        {items.map((item) => (
          <Row key={item.id} dayId={dayId} item={item} />
        ))}
      </ul>
    </section>
  );
}

function Row({ dayId, item }: { dayId: string; item: AlsoTodayItem }) {
  const [pending, start] = useTransition();
  const [note, setNote] = useState<string | null>(null);

  const run = (action: () => Promise<ActionResult>) =>
    start(async () => setNote((await action()).note ?? null));

  return (
    <li className={`py-5 ${item.done ? "opacity-55" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-3">
            <span className="w-[5rem] shrink-0 font-mono text-[10px] uppercase tracking-[0.08em] text-ink-faint">
              {item.ventureName}
            </span>
            <a
              href={item.url ?? "#"}
              target="_blank"
              rel="noreferrer"
              className={`text-[15px] leading-snug transition-opacity duration-200 hover:opacity-65 ${
                item.done ? "text-ink-muted line-through decoration-ink-faint" : "text-ink"
              }`}
            >
              {item.title}
            </a>
          </div>
          {item.reason && !item.done && (
            <p className="ml-[5.75rem] mt-2 max-w-[54ch] text-[13px] leading-relaxed text-ink-muted">
              {item.reason}
            </p>
          )}
        </div>

        <div className="ml-[5.75rem] flex shrink-0 items-center gap-2">
          {item.done ? (
            <span className="flex items-center gap-1.5 text-[12.5px] text-pale-green-ink">
              <Check size={12} weight="bold" />
              Done
            </span>
          ) : (
            <>
              {!item.started && (
                <RowButton onClick={() => run(() => startTask(dayId, item.id))} disabled={pending}>
                  Start
                </RowButton>
              )}
              <RowButton
                onClick={() => run(() => completeTask(dayId, item.id))}
                disabled={pending}
                primary={item.started}
              >
                Done
              </RowButton>
            </>
          )}
        </div>
      </div>

      {note && (
        <p role="status" className="ml-[5.75rem] mt-2.5 text-[12px] text-pale-yellow-ink">
          {note}
        </p>
      )}
    </li>
  );
}

function RowButton({
  children,
  onClick,
  disabled,
  primary,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`pressable rounded-lg px-3.5 py-2 text-[13px] font-medium disabled:opacity-50 ${
        primary
          ? "bg-cta text-cta-ink hover:bg-cta-hover"
          : "border border-btn-border bg-btn-face text-btn-ink hover:bg-btn-face-hover"
      }`}
    >
      {children}
    </button>
  );
}
