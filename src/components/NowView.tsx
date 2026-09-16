"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { blockTask, completeTask, startTask, type ActionResult } from "@/app/actions";
import { ArrowUpRight, Check, Chevron, Slash } from "./icons";

export type TaskCard = {
  id: string;
  identifier: string;
  title: string;
  url: string | null;
  ventureName: string;
  projectName: string | null;
  projectTarget: string | null;
  projectProgress: number | null;
};

export type NowViewProps = {
  dayId: string;
  date: string;
  active: TaskCard;
  showingBackup: boolean;
  blockReason: string | null;
  started: boolean;
  done: boolean;
  firstStep: string;
  reason: string;
  focusWindow: string | null;
  carryOverDays: number;
  needsSplit: boolean;
  degraded: boolean;
  alsoToday: TaskCard[];
};

export function NowView(props: NowViewProps) {
  const {
    dayId, active, showingBackup, blockReason, started, done,
    firstStep, reason, focusWindow, carryOverDays, needsSplit, degraded, alsoToday,
  } = props;

  const [pending, startTransition] = useTransition();
  const [askingReason, setAskingReason] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  // Drives the blur-crossfade when the card is about to be replaced.
  const [swapping, setSwapping] = useState(false);
  const reasonRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (askingReason) reasonRef.current?.focus();
  }, [askingReason]);

  function run(action: () => Promise<ActionResult>, opts: { swaps?: boolean } = {}) {
    if (opts.swaps) setSwapping(true);
    startTransition(async () => {
      const result = await action();
      setNote(result.note ?? null);
      setSwapping(false);
    });
  }

  function submitReason(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = new FormData(event.currentTarget).get("reason");
    setAskingReason(false);
    run(() => blockTask(dayId, active.id, String(value ?? "")), { swaps: true });
  }

  return (
    <main className="relative z-0 mx-auto w-full max-w-[1120px] px-5 py-14 sm:px-8 md:py-20">
      <header className="rise mb-10 flex items-baseline justify-between gap-4">
        <p className="label">
          {showingBackup ? "Backup task" : "Today’s needle mover"}
        </p>
        <p className="font-mono text-[11px] tracking-wide text-ink-faint">{props.date}</p>
      </header>

      <div className="grid gap-5 md:grid-cols-12 md:gap-6">
        {/* ---------------------------------------------------- the card -- */}
        <section className="md:col-span-8">
          {/* Double bezel: an outer tray holding an inner plate, concentric radii. */}
          <div className="rise rise-1 rounded-[2rem] bg-ground-deep p-1.5 ring-1 ring-hairline">
            <article
              className={`rounded-[calc(2rem-0.375rem)] bg-surface px-7 py-8 shadow-[var(--lift)] sm:px-10 sm:py-11 ${
                swapping ? "swapping" : ""
              }`}
              style={{ boxShadow: "var(--lift), var(--inner-light)" }}
            >
              <div className="mb-6 flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-surface-sunken px-3 py-1 text-[10px] font-medium uppercase tracking-[0.2em] text-ink-muted ring-1 ring-hairline">
                  {active.ventureName}
                </span>
                <span className="font-mono text-[11px] text-ink-faint">{active.identifier}</span>
                {showingBackup && (
                  <span className="rounded-full bg-warn-soft px-3 py-1 text-[10px] font-medium uppercase tracking-[0.2em] text-warn">
                    Fallback
                  </span>
                )}
              </div>

              <h1 className="font-display text-[2.6rem] leading-[1.04] tracking-[-0.015em] text-ink sm:text-[3.4rem]">
                {active.url ? (
                  <a
                    href={active.url}
                    target="_blank"
                    rel="noreferrer"
                    className="group inline transition-colors duration-200 hover:text-accent"
                  >
                    {active.title}
                    <ArrowUpRight className="ml-2 inline -translate-y-3 text-ink-faint transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] group-hover:-translate-y-[0.9rem] group-hover:translate-x-0.5" />
                  </a>
                ) : (
                  active.title
                )}
              </h1>

              {done ? (
                <div className="mt-8 flex items-center gap-2.5 text-accent">
                  <Check />
                  <p className="text-sm font-medium">Done. Nothing else is asked of you today.</p>
                </div>
              ) : (
                <>
                  <div className="mt-8">
                    <p className="label mb-2.5">First step</p>
                    <div className="rounded-xl bg-accent-soft/70 px-5 py-4 ring-1 ring-hairline">
                      <p className="text-[15px] font-medium leading-relaxed text-ink">{firstStep}</p>
                    </div>
                  </div>

                  {focusWindow && (
                    <p className="mt-5 font-mono text-xs tracking-wide text-ink-muted">
                      {focusWindow}
                    </p>
                  )}
                </>
              )}

              {/* ------------------------------------------------ actions -- */}
              {!done && (
                <div className="mt-9">
                  {askingReason ? (
                    <form onSubmit={submitReason} className="flex flex-wrap items-center gap-2">
                      <input
                        ref={reasonRef}
                        name="reason"
                        placeholder="What is blocking it?"
                        maxLength={140}
                        className="min-w-0 flex-1 rounded-full bg-surface-sunken px-5 py-3 text-sm text-ink outline-none ring-1 ring-hairline transition-shadow duration-200 placeholder:text-ink-faint focus:ring-2 focus:ring-accent"
                      />
                      <button type="submit" className="pressable rounded-full bg-warn px-5 py-3 text-sm font-medium text-white">
                        Log it
                      </button>
                      <button
                        type="button"
                        onClick={() => setAskingReason(false)}
                        className="pressable rounded-full px-4 py-3 text-sm text-ink-muted hover:text-ink"
                      >
                        Cancel
                      </button>
                    </form>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2.5">
                      {!started && (
                        <button
                          onClick={() => run(() => startTask(dayId, active.id))}
                          disabled={pending}
                          className="pressable lift-on-hover group flex items-center gap-3 rounded-full bg-accent py-2.5 pl-6 pr-2.5 text-sm font-medium text-accent-ink disabled:opacity-60"
                        >
                          Start
                          {/* Button-in-button: the icon lives in its own well. */}
                          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] group-hover:scale-105">
                            <ArrowUpRight />
                          </span>
                        </button>
                      )}

                      <button
                        onClick={() => run(() => completeTask(dayId, active.id))}
                        disabled={pending}
                        className={`pressable flex items-center gap-2 rounded-full px-5 py-3 text-sm font-medium disabled:opacity-60 ${
                          started
                            ? "bg-accent text-accent-ink"
                            : "bg-surface-sunken text-ink ring-1 ring-hairline hover:ring-hairline-strong"
                        }`}
                      >
                        <Check />
                        Done
                      </button>

                      {!showingBackup && (
                        <button
                          onClick={() => setAskingReason(true)}
                          disabled={pending}
                          className="pressable flex items-center gap-2 rounded-full px-5 py-3 text-sm text-ink-muted ring-1 ring-hairline transition-colors hover:text-warn hover:ring-hairline-strong disabled:opacity-60"
                        >
                          <Slash />
                          Blocked
                        </button>
                      )}
                    </div>
                  )}

                  {note && (
                    <p role="status" className="mt-4 text-xs leading-relaxed text-warn">
                      {note}
                    </p>
                  )}
                </div>
              )}
            </article>
          </div>

          <AlsoToday items={alsoToday} />
        </section>

        {/* ---------------------------------------------------- the rail -- */}
        <aside className="rise rise-2 md:col-span-4">
          <div className="flex h-full flex-col gap-7 rounded-[1.5rem] bg-surface/60 px-6 py-7 ring-1 ring-hairline">
            <div>
              <p className="label mb-3">Target</p>
              {active.projectName ? (
                <>
                  <p className="text-[15px] leading-snug text-ink">{active.projectName}</p>
                  {active.projectTarget && (
                    <p className="mt-1 font-mono text-[11px] text-ink-faint">
                      due {active.projectTarget}
                    </p>
                  )}
                  {active.projectProgress !== null && (
                    <Progress value={active.projectProgress} />
                  )}
                </>
              ) : (
                <p className="text-sm leading-relaxed text-ink-muted">
                  No project target. This was ranked on urgency and momentum alone.
                </p>
              )}
            </div>

            <Divider />

            <div>
              <p className="label mb-3">Why this one</p>
              <p className="text-[13.5px] leading-relaxed text-ink-soft">{reason}</p>
            </div>

            {(carryOverDays > 0 || degraded || blockReason) && (
              <>
                <Divider />
                <div className="space-y-3">
                  {blockReason && (
                    <Note tone="warn" label="Blocked">
                      {blockReason}
                    </Note>
                  )}
                  {needsSplit ? (
                    <Note tone="warn" label={`${carryOverDays} days running`}>
                      Split this into smaller issues, or drop its priority and let something
                      else through.
                    </Note>
                  ) : carryOverDays > 0 ? (
                    <Note tone="muted" label="Carried over">
                      Held over from yesterday.
                    </Note>
                  ) : null}
                  {degraded && (
                    <Note tone="muted" label="Ranking">
                      Few projects have target dates, so this leaned on deadlines and momentum
                      rather than goal leverage.
                    </Note>
                  )}
                </div>
              </>
            )}
          </div>
        </aside>
      </div>
    </main>
  );
}

function Divider() {
  return <div className="h-px w-full bg-hairline" />;
}

function Progress({ value }: { value: number }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div className="mt-4">
      <div
        className="h-[3px] w-full overflow-hidden rounded-full bg-hairline"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Project progress"
      >
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-700 ease-[cubic-bezier(0.23,1,0.32,1)]"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-2 font-mono text-[11px] text-ink-faint">{pct}% complete</p>
    </div>
  );
}

function Note({
  tone,
  label,
  children,
}: {
  tone: "warn" | "muted";
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className={`label mb-1 ${tone === "warn" ? "text-warn" : ""}`}>{label}</p>
      <p className="text-[13px] leading-relaxed text-ink-muted">{children}</p>
    </div>
  );
}

/**
 * The drawer. Uses grid-template-rows 0fr→1fr rather than max-height: it is the
 * one clean way to animate to intrinsic height. It does cost a layout pass,
 * which the performance rule normally forbids — acceptable here because it is
 * five rows, opened by hand once or twice a day, never during scroll.
 */
function AlsoToday({ items }: { items: TaskCard[] }) {
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;

  return (
    <div className="rise rise-3 mt-4">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="pressable group flex w-full items-center justify-between rounded-full px-6 py-3.5 text-left ring-1 ring-hairline transition-colors hover:ring-hairline-strong"
      >
        <span className="label">Also today · {items.length}</span>
        <Chevron
          className={`text-ink-faint transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      <div
        className="grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          <ul className="mt-2 space-y-px rounded-2xl bg-surface/60 p-2 ring-1 ring-hairline">
            {items.map((item) => (
              <li key={item.id}>
                <a
                  href={item.url ?? "#"}
                  target="_blank"
                  rel="noreferrer"
                  className="group flex items-baseline gap-3 rounded-xl px-4 py-3 transition-colors duration-200 hover:bg-surface-sunken"
                >
                  <span className="font-mono text-[10px] uppercase tracking-wider text-ink-faint">
                    {item.ventureName}
                  </span>
                  <span className="flex-1 text-[14px] leading-snug text-ink-soft">{item.title}</span>
                  <ArrowUpRight className="shrink-0 -translate-y-px text-ink-faint opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
