import type { ClosedIssue, ProjectMovement } from "@/lib/recap";

/**
 * The day after it has been closed. Shows the same facts the email carries —
 * the narrative is read from the day row rather than regenerated, so the two
 * can never disagree.
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
  const byVenture = closed.reduce<Record<string, ClosedIssue[]>>((acc, issue) => {
    (acc[issue.ventureName] ??= []).push(issue);
    return acc;
  }, {});

  return (
    <main className="relative z-0 mx-auto w-full max-w-3xl px-5 py-16 sm:px-8 md:py-24">
      <header
        className="enter mb-12 flex items-baseline justify-between border-b border-line pb-5"
        style={{ "--index": 0 } as React.CSSProperties}
      >
        <p className="label">Day closed</p>
        <p className="font-mono text-[11px] text-ink-faint">{date}</p>
      </header>

      <section
        className="enter rounded-xl border border-line bg-surface px-7 py-9 sm:px-10"
        style={{ "--index": 1 } as React.CSSProperties}
      >
        {summary && <p className="editorial text-[1.75rem] text-ink sm:text-[2rem]">{summary}</p>}

        <div className="mt-10 grid gap-10 sm:grid-cols-2">
          <div>
            <p className="label mb-4">Closed today · {closed.length}</p>
            {closed.length === 0 ? (
              <p className="text-[14px] text-ink-muted">Nothing.</p>
            ) : (
              Object.entries(byVenture).map(([venture, issues]) => (
                <div key={venture} className="mb-5">
                  <p className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-ink-faint">
                    {venture}
                  </p>
                  <ul className="space-y-1.5">
                    {issues.map((issue) => (
                      <li key={issue.identifier} className="text-[14px] leading-snug text-ink-soft">
                        {issue.title}
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            )}
          </div>

          <div>
            <p className="label mb-4">Targets moved</p>
            {movements.length === 0 ? (
              <p className="text-[14px] text-ink-muted">None moved today.</p>
            ) : (
              <ul className="space-y-4">
                {movements.map((m) => (
                  <li key={m.name}>
                    <p className="text-[14px] leading-snug text-ink">{m.name}</p>
                    <p className="mt-1 font-mono text-[11px] text-ink-faint">
                      {Math.round(m.before * 100)}% → {Math.round(m.after * 100)}%
                      {m.targetDate ? ` · target ${m.targetDate}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {tomorrow && (
          <div className="mt-10 border-t border-line pt-7">
            <p className="label mb-3">Tomorrow</p>
            <p className="text-[15px] leading-snug text-ink">{tomorrow.title}</p>
            <p className="mt-1 font-mono text-[11px] text-ink-faint">
              {tomorrow.ventureName} · {tomorrow.identifier}
            </p>
            {tomorrowNote && (
              <p className="mt-3 max-w-[60ch] text-[13.5px] leading-relaxed text-ink-muted">
                {tomorrowNote}
              </p>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
