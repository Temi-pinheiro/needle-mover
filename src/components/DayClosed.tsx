import type { ClosedIssue, ProjectMovement } from "@/lib/recap";
import { HeaderNav } from "./HeaderNav";
import { ClosedList } from "./ClosedList";

/**
 * The day after it has been closed.
 *
 * Reads the narrative from the day row rather than regenerating it, so this
 * page and the recap email can never disagree.
 *
 * Structure follows what you actually want to know, in order: what the day
 * amounted to, the two numbers that summarise it, then the detail. The
 * previous version led with a 36-row list and left half the width empty when
 * nothing had moved, which buried the summary and told you nothing at a
 * glance.
 */
export function DayClosed({
  date,
  summary,
  closed,
  movements,
  tomorrow,
  tomorrowNote,
}: {
  date: string;
  summary: string | null;
  closed: ClosedIssue[];
  movements: ProjectMovement[];
  tomorrow: { identifier: string; title: string; ventureName: string } | null;
  tomorrowNote: string | null;
}) {
  const projects = new Set(closed.map((c) => `${c.ventureName}/${c.projectName ?? "none"}`)).size;

  return (
    <main className="relative z-0 mx-auto w-full max-w-3xl px-5 pb-24 pt-16 sm:px-8">
      <HeaderNav eyebrow="Day closed" date={date} />

      {summary && (
        <p
          className="enter max-w-[46ch] text-[1.6rem] leading-[1.35] tracking-[-0.015em] text-ink sm:text-[1.9rem]"
          style={{ "--index": 1 } as React.CSSProperties}
        >
          {summary}
        </p>
      )}

      {/* Two figures given real weight, so the shape of the day reads at a glance. */}
      <div
        className="enter mt-12 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-3"
        style={{ "--index": 2 } as React.CSSProperties}
      >
        <Figure value={closed.length} label={closed.length === 1 ? "issue closed" : "issues closed"} />
        <Figure value={projects} label={projects === 1 ? "project touched" : "projects touched"} />
        <Figure
          value={movements.length}
          label={movements.length === 1 ? "target moved" : "targets moved"}
          muted={movements.length === 0}
        />
      </div>

      {movements.length > 0 && (
        <Block index={3} title="Targets moved">
          <ul className="divide-y divide-line border-t border-line">
            {movements.map((m) => (
              <li key={m.name} className="flex flex-wrap items-baseline justify-between gap-3 py-4">
                <div className="min-w-0">
                  <p className="truncate text-[15px] text-ink">{m.name}</p>
                  <p className="mt-0.5 font-mono text-[11px] uppercase tracking-[0.08em] text-ink-faint">
                    {m.ventureName}
                    {m.targetDate ? ` · due ${m.targetDate}` : ""}
                  </p>
                </div>
                <p className="shrink-0 font-mono text-[13px] tabular-nums text-ink-muted">
                  {Math.round(m.before * 100)}
                  <span className="mx-1.5 text-ink-faint">to</span>
                  <span className="text-pale-green-ink">{Math.round(m.after * 100)}%</span>
                </p>
              </li>
            ))}
          </ul>
        </Block>
      )}

      <Block index={4} title="Closed today">
        <ClosedList issues={closed} />
      </Block>

      {tomorrow && (
        <Block index={5} title="Tomorrow">
          <div className="border-t border-line pt-5">
            <p className="text-[1.15rem] leading-snug text-ink">{tomorrow.title}</p>
            <p className="mt-1.5 font-mono text-[11px] uppercase tracking-[0.08em] text-ink-faint">
              {tomorrow.ventureName} · {tomorrow.identifier}
            </p>
            {tomorrowNote && (
              <p className="mt-4 max-w-[58ch] text-[14px] leading-relaxed text-ink-muted">
                {tomorrowNote}
              </p>
            )}
          </div>
        </Block>
      )}
    </main>
  );
}

function Figure({ value, label, muted }: { value: number; label: string; muted?: boolean }) {
  return (
    <div className="bg-surface px-5 py-6">
      <p
        className={`font-mono text-[2rem] leading-none tabular-nums ${
          muted ? "text-ink-faint" : "text-ink"
        }`}
      >
        {value}
      </p>
      <p className="mt-2.5 text-[12px] leading-snug text-ink-muted">{label}</p>
    </div>
  );
}

function Block({
  index,
  title,
  children,
}: {
  index: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="enter mt-14" style={{ "--index": index } as React.CSSProperties}>
      <h2 className="mb-5 text-[15px] font-medium text-ink">{title}</h2>
      {children}
    </section>
  );
}
