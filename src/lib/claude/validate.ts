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

export type ResolvedPick = {
  needleMover: ScoredCandidate;
  backup: ScoredCandidate | null;
  alsoToday: ScoredCandidate[];
  reason: string;
  firstStep: string;
  plainFocus: string;
  /** What we had to fix. Logged with the day so a drifting prompt is visible. */
  repairs: string[];
};

export class PickError extends Error {}

export function resolvePick(pick: Pick, shortlist: ScoredCandidate[]): ResolvedPick {
  if (shortlist.length === 0) throw new PickError("Cannot resolve a pick from an empty shortlist.");

  const byIdentifier = new Map(shortlist.map((s) => [s.candidate.issue.identifier, s]));
  const repairs: string[] = [];

  const needleMover = byIdentifier.get(pick.needle_mover);
  if (!needleMover) {
    // The one failure we don't paper over: picking the top-scored issue instead
    // would silently discard the reason and first step, which describe a
    // different task.
    throw new PickError(
      `Claude picked ${pick.needle_mover}, which is not on the shortlist (${[...byIdentifier.keys()].join(", ")}).`,
    );
  }

  // Backup: must exist, differ from the needle mover, and be startable on its
  // own. Falling back to the next-highest-scored issue keeps the Blocked button
  // useful rather than empty.
  let backup = byIdentifier.get(pick.backup) ?? null;
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
    .map((id) => byIdentifier.get(id))
    .filter((s): s is ScoredCandidate => {
      if (!s) return false;
      if (excluded.has(s.candidate.issue.id)) return false;
      if (seen.has(s.candidate.issue.id)) return false;
      seen.add(s.candidate.issue.id);
      return true;
    });

  if (candidates.length < pick.also_today.length) {
    repairs.push(
      `dropped ${pick.also_today.length - candidates.length} unusable "also today" item(s)`,
    );
  }

  const ventures = new Set<string>();
  const alsoToday: ScoredCandidate[] = [];
  for (const item of candidates) {
    const venture = item.candidate.issue.ventureName;
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
