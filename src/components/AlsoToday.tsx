"use client";

import { useState, useTransition } from "react";
import { CaretDown } from "@phosphor-icons/react/dist/ssr/CaretDown";
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
 * it does not promote the next thing automatically. But a passive list of
 * titles sends you back to Linear to re-decide, which is the work this app
 * exists to remove. So each row carries the reason it earned a place and can
 * be started from here.
 *
 * Opens by itself once the needle mover is done, because that is the moment it
 * is for.
 */
export function AlsoToday({
  dayId,
  items,
  openByDefault,
}: {
  dayId: string;
  items: AlsoTodayItem[];
  openByDefault: boolean;
}) {
  const [open, setOpen] = useState(openByDefault);
  if (items.length === 0) return null;

  const remaining = items.filter((i) => !i.done).length;

  return (
    <div className="enter mt-6" style={{ "--index": 3 } as React.CSSProperties}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="pressable flex w-full items-center justify-between border-b border-line py-3.5 text-left transition-colors hover:border-line-strong"
      >
        <span className="label">
          Also today · {remaining === items.length ? items.length : `${remaining} of ${items.length}`}
        </span>
        <CaretDown
          size={12}
          weight="bold"
          className={`text-ink-faint transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      <div
        className="grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          <ul className="divide-y divide-line">
            {items.map((item) => (
              <Row key={item.id} dayId={dayId} item={item} />
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function Row({ dayId, item }: { dayId: string; item: AlsoTodayItem }) {
  const [pending, start] = useTransition();
  const [note, setNote] = useState<string | null>(null);

  const run = (action: () => Promise<ActionResult>) =>
    start(async () => setNote((await action()).note ?? null));

  return (
    <li className={`py-4 ${item.done ? "opacity-55" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-3">
            <span className="w-[4.5rem] shrink-0 font-mono text-[10px] uppercase tracking-[0.08em] text-ink-faint">
              {item.ventureName}
            </span>
            <a
              href={item.url ?? "#"}
              target="_blank"
              rel="noreferrer"
              className={`text-[14px] leading-snug transition-opacity duration-200 hover:opacity-65 ${
                item.done ? "text-ink-muted line-through decoration-ink-faint" : "text-ink"
              }`}
            >
              {item.title}
            </a>
          </div>
          {item.reason && !item.done && (
            <p className="ml-[5.25rem] mt-1.5 max-w-[52ch] text-[12.5px] leading-relaxed text-ink-muted">
              {item.reason}
            </p>
          )}
        </div>

        <div className="ml-[5.25rem] flex shrink-0 items-center gap-2">
          {item.done ? (
            <span className="flex items-center gap-1.5 text-[12px] text-pale-green-ink">
              <Check size={12} weight="bold" />
              Done
            </span>
          ) : (
            <>
              {!item.started && (
                <button
                  onClick={() => run(() => startTask(dayId, item.id))}
                  disabled={pending}
                  className="pressable rounded-md border border-line px-3 py-1.5 text-[12px] font-medium text-ink-soft transition-colors hover:text-ink disabled:opacity-50"
                >
                  Start
                </button>
              )}
              <button
                onClick={() => run(() => completeTask(dayId, item.id))}
                disabled={pending}
                className={`pressable rounded-md px-3 py-1.5 text-[12px] font-medium disabled:opacity-50 ${
                  item.started
                    ? "bg-cta text-cta-ink hover:bg-cta-hover"
                    : "border border-line text-ink-soft hover:text-ink"
                }`}
              >
                Done
              </button>
            </>
          )}
        </div>
      </div>

      {note && (
        <p role="status" className="ml-[5.25rem] mt-2.5 text-[12px] text-pale-yellow-ink">
          {note}
        </p>
      )}
    </li>
  );
}
