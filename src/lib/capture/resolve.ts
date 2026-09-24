import type { ProposedIssue } from "@/lib/db/types";
import type { ParsedCapture } from "./schema";

/** What a capture can be filed under: every active venture and its projects. */
export type CaptureVenture = {
  id: string;
  name: string;
  projects: Array<{ id: string; name: string; targetDate: string | null }>;
};

export const TITLE_MAX = 120;

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Turns Claude's answer into a proposal that only names things that exist.
 *
 * Repaired rather than retried, like the daily pick: the inbox is a human
 * review step anyway, so a blank field the user fills in beats a second call.
 * The one rule is that nothing unverified survives — an unknown venture or a
 * project from the wrong venture becomes null, never a guess.
 */
export function resolveProposal(
  parsed: ParsedCapture,
  ventures: CaptureVenture[],
  rawText: string,
  today: string,
): ProposedIssue {
  let venture = parsed.venture
    ? (ventures.find((v) => norm(v.name) === norm(parsed.venture!)) ?? null)
    : null;

  let projectId: string | null = null;
  if (parsed.project) {
    const want = norm(parsed.project);
    const inVenture = venture?.projects.find((p) => norm(p.name) === want);
    if (inVenture) {
      projectId = inVenture.id;
    } else if (!venture) {
      // A project name can identify its venture on its own, but only if it is
      // unambiguous across every venture.
      const owners = ventures.filter((v) => v.projects.some((p) => norm(p.name) === want));
      if (owners.length === 1) {
        venture = owners[0];
        projectId = owners[0].projects.find((p) => norm(p.name) === want)!.id;
      }
    }
  }

  // With a single venture there is nothing to choose between.
  if (!venture && ventures.length === 1) venture = ventures[0];

  return {
    title: cleanTitle(parsed.title) || fallbackTitle(rawText),
    workspace_id: venture?.id ?? null,
    project_id: projectId,
    due_date: validDueDate(parsed.due_date, today),
    description: parsed.description?.trim() || null,
  };
}

/** A proposal for a capture Claude never saw, so the inbox still has a starting point. */
export function blankProposal(rawText: string | null, ventures: CaptureVenture[]): ProposedIssue {
  return {
    title: rawText ? fallbackTitle(rawText) : "",
    workspace_id: ventures.length === 1 ? ventures[0].id : null,
    project_id: null,
    due_date: null,
    description: null,
  };
}

function cleanTitle(title: string): string {
  return title.trim().replace(/\s+/g, " ").replace(/\.$/, "").slice(0, TITLE_MAX);
}

/** The first sentence of what was said, which is usually the commitment itself. */
export function fallbackTitle(rawText: string): string {
  const first = rawText.trim().split(/(?<=[.!?])\s+/)[0] ?? "";
  return cleanTitle(first);
}

/**
 * A due date must be a real calendar date and not already past. A date in the
 * past is almost always a misheard or misread weekday, and filing it would
 * make the issue overdue the moment it lands.
 */
export function validDueDate(value: string | null, today: string): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return null;
  return value < today ? null : value;
}

/**
 * The issue description as filed in Linear. The original words always go in,
 * quoted, because a parsed title loses context and the capture is the only
 * record of what was actually promised.
 */
export function issueDescription(description: string | null, rawText: string | null): string {
  const parts: string[] = [];
  if (description?.trim()) parts.push(description.trim());
  if (rawText?.trim()) {
    parts.push(
      `${rawText
        .trim()
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n")}\n\n— captured in Needle Mover`,
    );
  }
  return parts.join("\n\n");
}
