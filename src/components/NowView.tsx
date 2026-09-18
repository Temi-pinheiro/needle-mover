"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { blockTask, completeTask, startTask, type ActionResult } from "@/app/actions";
import { ArrowUpRight, Check, Slash } from "./icons";
import { AlsoToday, type AlsoTodayItem } from "./AlsoToday";
import { CloseDay } from "./CloseDay";
import { HeaderNav } from "./HeaderNav";

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
  blockReason: string | null;
  started: boolean;
  done: boolean;
  firstStep: string;
  reason: string;
  carryOverDays: number;
  needsSplit: boolean;
  degraded: boolean;
  alsoToday: AlsoTodayItem[];
};

export function NowView(props: NowViewProps) {
  const {
    dayId, active, blockReason, started, done,
    firstStep, reason, carryOverDays, needsSplit, degraded, alsoToday,
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
    <main className="relative z-0 mx-auto w-full max-w-5xl px-5 py-16 sm:px-8 md:py-24">
      <HeaderNav eyebrow="Today’s needle mover" date={props.date} />

      <div className="grid gap-6 md:grid-cols-12">
        {/* ---------------------------------------------------- the card -- */}
        <section className="md:col-span-8">
          <article
            className={`enter rounded-xl border border-line bg-surface px-7 py-9 sm:px-10 sm:py-11 ${
              swapping ? "swapping" : ""
            }`}
            style={{ "--index": 1 } as React.CSSProperties}
          >
            <div className="mb-7 flex flex-wrap items-center gap-2.5">
              <Tag>{active.ventureName}</Tag>
              <span className="font-mono text-[11px] text-ink-faint">{active.identifier}</span>
            </div>

            <h1 className="editorial text-[2.5rem] text-ink sm:text-[3.25rem]">
              {active.url ? (
                <a
                  href={active.url}
                  target="_blank"
                  rel="noreferrer"
                  className="group inline transition-colors duration-200 hover:text-ink-muted"
                >
                  {active.title}
                  <ArrowUpRight className="ml-2.5 inline -translate-y-3 text-ink-faint transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:-translate-y-[0.9rem] group-hover:translate-x-0.5" />
                </a>
              ) : (
                active.title
              )}
            </h1>

            {done ? (
              <div className="mt-9 flex items-center gap-2.5 border-t border-line pt-7 text-pale-green-ink">
                <Check />
                <p className="text-sm font-medium">Done. Nothing else is asked of you today.</p>
              </div>
            ) : (
              <>
                <div className="mt-9">
                  <p className="label mb-3">First step</p>
                  <div className="rounded-lg bg-pale-green px-5 py-4">
                    <p className="text-[15px] font-medium leading-relaxed text-pale-green-ink">
                      {firstStep}
                    </p>
                  </div>
                </div>
              </>
            )}

            {/* -------------------------------------------------- actions -- */}
            {!done && (
              <div className="mt-9 border-t border-line pt-7">
                {askingReason ? (
                  <form onSubmit={submitReason} className="flex flex-wrap items-center gap-2">
                    <input
                      ref={reasonRef}
                      name="reason"
                      placeholder="What is blocking it?"
                      maxLength={140}
                      className="min-w-0 flex-1 rounded-md border border-line bg-surface-sunken px-4 py-2.5 text-sm text-ink outline-none transition-colors duration-200 placeholder:text-ink-faint focus:border-ink"
                    />
                    <button
                      type="submit"
                      className="pressable rounded-md bg-cta px-5 py-2.5 text-sm font-medium text-cta-ink hover:bg-cta-hover"
                    >
                      Log it
                    </button>
                    <button
                      type="button"
                      onClick={() => setAskingReason(false)}
                      className="pressable rounded-md px-3 py-2.5 text-sm text-ink-muted transition-colors hover:text-ink"
                    >
                      Cancel
                    </button>
                  </form>
                ) : (
                  <div className="flex flex-wrap items-center gap-2.5">
                    {!started && <Primary onClick={() => run(() => startTask(dayId, active.id))} disabled={pending}>Start</Primary>}

                    {started ? (
                      <Primary onClick={() => run(() => completeTask(dayId, active.id))} disabled={pending} icon={<Check />}>
                        Done
                      </Primary>
                    ) : (
                      <Secondary onClick={() => run(() => completeTask(dayId, active.id))} disabled={pending} icon={<Check />}>
                        Done
                      </Secondary>
                    )}

                    <Secondary onClick={() => setAskingReason(true)} disabled={pending} icon={<Slash />}>
                      Blocked
                    </Secondary>
                  </div>
                )}

                {note && (
                  <p role="status" className="mt-4 text-xs leading-relaxed text-pale-yellow-ink">
                    {note}
                  </p>
                )}
              </div>
            )}
          </article>

          <AlsoToday dayId={dayId} items={alsoToday} openByDefault={done} />

          <div className="mt-2 border-t border-line">
            <CloseDay />
          </div>
        </section>

        {/* ---------------------------------------------------- the rail -- */}
        <aside
          className="enter md:col-span-4"
          style={{ "--index": 2 } as React.CSSProperties}
        >
          <div className="flex h-full flex-col gap-7 rounded-xl border border-line bg-surface px-6 py-7">
            <div>
              <p className="label mb-3">Target</p>
              {active.projectName ? (
                <>
                  <p className="text-[15px] leading-snug text-ink">{active.projectName}</p>
                  {active.projectTarget && (
                    <p className="mt-1.5 font-mono text-[11px] text-ink-faint">
                      due {active.projectTarget}
                    </p>
                  )}
                  {active.projectProgress !== null && <Progress value={active.projectProgress} />}
                </>
              ) : (
                <p className="text-sm leading-relaxed text-ink-muted">
                  No project target. This was ranked on urgency and momentum alone.
                </p>
              )}
            </div>

            <div className="h-px w-full bg-line" />

            <div>
              <p className="label mb-3">Why this one</p>
              <p className="text-[13.5px] leading-relaxed text-ink-soft">{reason}</p>
            </div>

            {(carryOverDays > 0 || degraded || blockReason) && (
              <>
                <div className="h-px w-full bg-line" />
                <div className="space-y-5">
                  {blockReason && <Note label="Blocked" tone="yellow">{blockReason}</Note>}
                  {needsSplit ? (
                    <Note label={`${carryOverDays} days running`} tone="red">
                      Split this into smaller issues, or drop its priority and let something else
                      through.
                    </Note>
                  ) : carryOverDays > 0 ? (
                    <Note label="Carried over">Held over from yesterday.</Note>
                  ) : null}
                  {degraded && (
                    <Note label="Ranking">
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

/* -------------------------------------------------------------- pieces -- */

function Tag({ children, tone }: { children: React.ReactNode; tone?: "yellow" }) {
  // Tags keep the pill shape; larger containers and buttons do not.
  const palette =
    tone === "yellow" ? "bg-pale-yellow text-pale-yellow-ink" : "bg-surface-sunken text-ink-muted";
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.08em] ${palette}`}
    >
      {children}
    </span>
  );
}

function Primary({
  children,
  onClick,
  disabled,
  icon,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="pressable flex items-center gap-2 rounded-md bg-cta px-5 py-2.5 text-sm font-medium text-cta-ink hover:bg-cta-hover disabled:opacity-50"
    >
      {icon}
      {children}
    </button>
  );
}

function Secondary({
  children,
  onClick,
  disabled,
  icon,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="pressable hover-lift flex items-center gap-2 rounded-md border border-line bg-surface px-5 py-2.5 text-sm font-medium text-ink-soft transition-colors hover:text-ink disabled:opacity-50"
    >
      {icon}
      {children}
    </button>
  );
}

function Progress({ value }: { value: number }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div className="mt-5">
      <div
        className="h-1 w-full overflow-hidden rounded-full bg-ground-deep"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Project progress"
      >
        <div
          className="h-full rounded-full bg-pale-green-ink transition-[width] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-2.5 font-mono text-[11px] text-ink-faint">{pct}% complete</p>
    </div>
  );
}

function Note({
  label,
  children,
  tone,
}: {
  label: string;
  children: React.ReactNode;
  tone?: "yellow" | "red";
}) {
  const labelColor =
    tone === "yellow" ? "text-pale-yellow-ink" : tone === "red" ? "text-pale-red-ink" : "";
  return (
    <div>
      <p className={`label mb-1.5 ${labelColor}`}>{label}</p>
      <p className="text-[13px] leading-relaxed text-ink-muted">{children}</p>
    </div>
  );
}
