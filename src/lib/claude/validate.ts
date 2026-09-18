import type { ScoredCandidate } from "@/lib/scoring/types";
import type { Pick } from "./schema";

/**
 * Claude's pick, reconciled against the shortlist.
 *
 * The model can return an identifier that isn't on the shortlist, a backup
 * equal to the needle mover, or an "also today" list that breaks the two-venture
 * cap. Because this runs once a day, repairing deterministically beats a retry
 * loop: a brief that is slightly less ideal beats a brief that doesn't arrive.
 */

export const ALSO_TODAY_MAX_ITEMS = 5;
export const ALSO_TODAY_MAX_VENTURES = 2;

/** An "also today" item and why it earned a place. */
export type AlsoTodayItem = { candidate: ScoredCandidate; reason: string };

export type ResolvedPick = {
  needleMover: ScoredCandidate;
  backup: ScoredCandidate | null;
  alsoToday: AlsoTodayItem[];
  reason: string;
  firstStep: string;
  plainFocus: string;
  /** What we had to fix. Logged with the day so a drifting prompt is visible. */
  repairs: string[];
};

/**
 * How Claude refers to a shortlist entry.
 *
 * Linear issue identifiers (TEM-6) are unique within an organisation but not
 * across them: two organisations can each have a team keyed ENG, and both
 * produce ENG-1. Since a venture can be a separate Linear organisation, the
 * shortlist can contain two entries with the same identifier, and a map keyed
 * on identifier alone would silently drop one — sending Claude's pick to the
 * wrong issue with nothing to show for it.
 *
 * So identifiers are qualified with the venture only when they actually
 * collide. The common case stays short and readable in the prompt and in logs.
 */
export function shortlistRefs(shortlist: ScoredCandidate[]) {
  const counts = new Map<string, number>();
  for (const s of shortlist) {
    const id = s.candidate.issue.identifier;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const qualified = [...counts.values()].some((n) => n > 1);

  const refOf = (s: ScoredCandidate) =>
    qualified
      ? `${s.candidate.issue.ventureName}/${s.candidate.issue.identifier}`
      : s.candidate.issue.identifier;

  const byRef = new Map(shortlist.map((s) => [refOf(s), s]));

  return { qualified, refOf, byRef };
}

export class PickError extends Error {}

export function resolvePick(pick: Pick, shortlist: ScoredCandidate[]): ResolvedPick {
  if (shortlist.length === 0) throw new PickError("Cannot resolve a pick from an empty shortlist.");

  const { refOf, byRef, qualified } = shortlistRefs(shortlist);
  const repairs: string[] = [];

  /**
   * Accepts the qualified form, and falls back to a bare identifier when
   * Claude drops the venture prefix. An ambiguous bare identifier takes the
   * higher-scored entry — the shortlist is already sorted — and says so.
   */
  const lookup = (ref: string): ScoredCandidate | null => {
    const exact = byRef.get(ref);
    if (exact) return exact;
    if (!qualified) return null;

    const matches = shortlist.filter((s) => s.candidate.issue.identifier === ref);
    if (matches.length === 0) return null;
    if (matches.length > 1) {
      repairs.push(`"${ref}" was ambiguous across ventures; took ${refOf(matches[0])}`);
    }
    return matches[0];
  };

  const needleMover = lookup(pick.needle_mover);
  if (!needleMover) {
    // The one failure we don't paper over: picking the top-scored issue instead
    // would silently discard the reason and first step, which describe a
    // different task.
    throw new PickError(
      `Claude picked ${pick.needle_mover}, which is not on the shortlist (${[...byRef.keys()].join(", ")}).`,
    );
  }

  // Backup: must exist, differ from the needle mover, and be startable on its
  // own. Falling back to the next-highest-scored issue keeps the Blocked button
  // useful rather than empty.
  let backup = lookup(pick.backup);
  if (backup && backup.candidate.issue.id === needleMover.candidate.issue.id) {
    repairs.push("backup matched the needle mover");
    backup = null;
  }
  if (!backup && pick.backup) {
    repairs.push(`backup ${pick.backup} was not on the shortlist`);
  }
  if (!backup) {
    backup =
      shortlist.find(
        (s) => s.candidate.issue.id !== needleMover.candidate.issue.id && !s.candidate.issue.isBlocked,
      ) ?? null;
  }

  // Also today: drop unknowns and duplicates, then apply the caps in order so
  // the highest-scored ventures survive.
  const excluded = new Set(
    [needleMover, backup].filter(Boolean).map((s) => s!.candidate.issue.id),
  );

  const seen = new Set<string>();
  const candidates = pick.also_today
    .map((entry) => {
      const found = lookup(entry.identifier);
      return found ? { candidate: found, reason: entry.reason.trim() } : null;
    })
    .filter((item): item is AlsoTodayItem => {
      if (!item) return false;
      const id = item.candidate.candidate.issue.id;
      if (excluded.has(id)) return false;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });

  if (candidates.length < pick.also_today.length) {
    repairs.push(
      `dropped ${pick.also_today.length - candidates.length} unusable "also today" item(s)`,
    );
  }

  const ventures = new Set<string>();
  const alsoToday: AlsoTodayItem[] = [];
  for (const item of candidates) {
    const venture = item.candidate.candidate.issue.ventureName;
    if (!ventures.has(venture) && ventures.size >= ALSO_TODAY_MAX_VENTURES) {
      repairs.push(`"also today" exceeded ${ALSO_TODAY_MAX_VENTURES} ventures`);
      continue;
    }
    if (alsoToday.length >= ALSO_TODAY_MAX_ITEMS) {
      repairs.push(`"also today" exceeded ${ALSO_TODAY_MAX_ITEMS} items`);
      break;
    }
    ventures.add(venture);
    alsoToday.push(item);
  }

  const firstStep = pick.first_step.trim();
  if (!firstStep) repairs.push("first step was empty");

  return {
    needleMover,
    backup,
    alsoToday,
    reason: pick.reason.trim(),
    firstStep,
    plainFocus: pick.plain_focus.trim(),
    repairs: [...new Set(repairs)],
  };
}
