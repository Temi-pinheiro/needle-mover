"use client";

import { useState } from "react";
import { CaretDown } from "@phosphor-icons/react/dist/ssr/CaretDown";
import type { ClosedIssue } from "@/lib/recap";

/**
 * What closed today, grouped by project.
 *
 * The first version rendered every issue as one flat list. At 36 items that is
 * unreadable: nothing tells you where one item ends and the next begins, and
 * there is no way to see the shape of the day without reading all of it.
 *
 * Grouping by project is the right cut because a project is the thing a target
 * date hangs off, so "six issues closed against Guest links" says something
 * that six loose titles do not. Each group shows its first few and holds the
 * rest behind a count.
 */

const VISIBLE_PER_GROUP = 4;

type Group = { key: string; project: string; venture: string; issues: ClosedIssue[] };

function group(issues: ClosedIssue[]): Group[] {
  const map = new Map<string, Group>();

  for (const issue of issues) {
    const project = issue.projectName ?? "No project";
    const key = `${issue.ventureName}/${project}`;
    const existing = map.get(key);
    if (existing) existing.issues.push(issue);
    else map.set(key, { key, project, venture: issue.ventureName, issues: [issue] });
  }

  // Biggest groups first: the shape of the day is the point.
  return [...map.values()].sort((a, b) => b.issues.length - a.issues.length);
}

export function ClosedList({ issues }: { issues: ClosedIssue[] }) {
  const groups = group(issues);

  if (issues.length === 0) {
    return (
      <p className="text-[15px] leading-relaxed text-ink-muted">
        Nothing closed today. That is a normal outcome, not a failure.
      </p>
    );
  }

  return (
    <div className="divide-y divide-line border-t border-line">
      {groups.map((g) => (
        <ProjectGroup key={g.key} group={g} />
      ))}
    </div>
  );
}

function ProjectGroup({ group: g }: { group: Group }) {
  const [expanded, setExpanded] = useState(false);
  const hidden = g.issues.length - VISIBLE_PER_GROUP;
  const shown = expanded ? g.issues : g.issues.slice(0, VISIBLE_PER_GROUP);

  return (
    <section className="py-6">
      <header className="mb-4 flex items-baseline justify-between gap-4">
        <div className="min-w-0">
          <h3 className="truncate text-[15px] font-medium text-ink">{g.project}</h3>
          <p className="mt-0.5 font-mono text-[11px] uppercase tracking-[0.08em] text-ink-faint">
            {g.venture}
          </p>
        </div>
        <span className="shrink-0 font-mono text-[13px] tabular-nums text-ink-muted">
          {g.issues.length}
        </span>
      </header>

      <ul className="space-y-2.5">
        {shown.map((issue) => (
          <li key={issue.identifier}>
            <a
              href={issue.url ?? "#"}
              target="_blank"
              rel="noreferrer"
              className="group flex gap-3 transition-opacity duration-200 hover:opacity-65"
            >
              <span className="w-[4.5rem] shrink-0 pt-px font-mono text-[11px] tabular-nums text-ink-faint">
                {issue.identifier}
              </span>
              <span className="text-[14px] leading-snug text-ink-soft">{issue.title}</span>
            </a>
          </li>
        ))}
      </ul>

      {hidden > 0 && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="pressable mt-3.5 flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.08em] text-ink-faint transition-colors hover:text-ink"
        >
          {expanded ? "Show fewer" : `${hidden} more`}
          <CaretDown
            size={11}
            weight="bold"
            className={`transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
              expanded ? "rotate-180" : ""
            }`}
          />
        </button>
      )}
    </section>
  );
}
