import {
  CARRYOVER_SPLIT_THRESHOLD,
  DEADLINE_HORIZON_DAYS,
  DEFAULT_WEIGHTS,
  ISSUE_PRIORITY_WITHIN_TIER,
  MOMENTUM_IN_PROGRESS,
  MOMENTUM_PER_CARRYOVER_DAY,
  NEUTRAL,
  PRIORITY_SCORE,
  SHORTLIST_MAX_PER_PROJECT,
  SHORTLIST_SIZE,
  targetedThreshold,
  UNBLOCKS_SATURATION,
} from "./weights";
import type {
  Candidate,
  FactorName,
  FactorScores,
  ScoredCandidate,
  ScoringContext,
  ScoringResult,
} from "./types";

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/** Whole days from `today` to `iso`. Negative when `iso` is in the past. */
function daysUntil(iso: string, today: string): number {
  const toUtc = (d: string) => {
    const [y, m, day] = d.split("-").map(Number);
    return Date.UTC(y, m - 1, day);
  };
  return Math.round((toUtc(iso) - toUtc(today)) / 86_400_000);
}

/**
 * The priority half of goal leverage.
 *
 * Project priority sets the tier; issue priority only orders within it. Issue
 * priorities used to be compared directly across projects, which let a minor
 * project with every issue marked Urgent outrank an Urgent project whose
 * issues were prioritised honestly — issue priority is relative to its own
 * project, and says nothing about which project matters.
 *
 * The tier gap is 0.25 and the within-tier range at most 15% of the tier, so
 * the ordering is strict: an Urgent project's lowest issue (≈0.87) beats a
 * High project's most urgent one (0.75).
 *
 * With no project priority synced (before migration 0009), issue priority
 * stands alone, as it always did.
 */
export function priorityTerm(issuePriority: number, projectPriority: number | null | undefined): number {
  const issue = PRIORITY_SCORE[issuePriority] ?? NEUTRAL;
  if (projectPriority == null) return issue;
  const tier = PRIORITY_SCORE[projectPriority] ?? NEUTRAL;
  return tier * (1 - ISSUE_PRIORITY_WITHIN_TIER + ISSUE_PRIORITY_WITHIN_TIER * issue);
}

/**
 * Goal leverage: how much this issue moves a project toward its target.
 *
 * Gated on the project having a target date — an issue outside a targeted
 * project scores zero, per spec. That gate is why `scoreAll` renormalises when
 * targeted projects are scarce.
 */
export function goalLeverage(c: Candidate): number {
  const { project, issue } = c;
  if (!project?.targetDate) return 0;

  const priority = priorityTerm(issue.priority, project.priority);

  // Share of remaining project scope. Missing estimates are common, so treat
  // an unknown share as neutral rather than as "contributes nothing".
  const scopeShare =
    issue.estimate != null && project.scopeEstimate != null && project.scopeEstimate > 0
      ? clamp01(issue.estimate / project.scopeEstimate)
      : NEUTRAL;

  return clamp01(0.5 * priority + 0.5 * scopeShare);
}

/**
 * Deadline pressure: linear decay from the nearest of the issue due date and
 * the project target date. Anything overdue saturates at 1.
 */
export function deadlinePressure(c: Candidate, today: string): number {
  const dates = [c.issue.dueDate, c.project?.targetDate].filter(
    (d): d is string => typeof d === "string",
  );
  if (dates.length === 0) return 0;

  const soonest = Math.min(...dates.map((d) => daysUntil(d, today)));
  if (soonest <= 0) return 1;
  return clamp01(1 - soonest / DEADLINE_HORIZON_DAYS);
}

/** Unblocks others: saturates once the issue blocks a few others. */
export function unblocksOthers(c: Candidate): number {
  return clamp01(c.issue.blocksCount / UNBLOCKS_SATURATION);
}

/**
 * Momentum: already in progress, plus a boost per consecutive day it has been
 * carried over as an unfinished needle mover.
 */
export function momentum(c: Candidate, ctx: ScoringContext): number {
  const carried = ctx.carryOver[c.issue.id] ?? 0;
  const inProgress = c.issue.stateType === "started" ? MOMENTUM_IN_PROGRESS : 0;
  return clamp01(inProgress + carried * MOMENTUM_PER_CARRYOVER_DAY);
}

/**
 * Drop goal leverage and redistribute its weight proportionally across the
 * remaining factors, keeping the total at 1.
 */
function renormalise(weights: FactorScores): FactorScores {
  const freed = weights.goalLeverage;
  const rest = 1 - freed;
  const out = { ...weights, goalLeverage: 0 };
  if (rest <= 0) return out;
  for (const key of Object.keys(out) as FactorName[]) {
    if (key === "goalLeverage") continue;
    out[key] = weights[key] + freed * (weights[key] / rest);
  }
  return out;
}

/**
 * The top of the ranking, with no project taking more than its share.
 *
 * Issues with no project are not capped — "no project" is not one project.
 * When the cap leaves the list short (few projects), the best of what was held
 * back fills it, so a one-project backlog still gets a full shortlist.
 */
export function buildShortlist(ranked: ScoredCandidate[]): ScoredCandidate[] {
  const perProject = new Map<string, number>();
  const picked: ScoredCandidate[] = [];
  const heldBack: ScoredCandidate[] = [];

  for (const s of ranked) {
    if (picked.length >= SHORTLIST_SIZE) break;
    const project = s.candidate.project?.id;
    if (project && (perProject.get(project) ?? 0) >= SHORTLIST_MAX_PER_PROJECT) {
      heldBack.push(s);
      continue;
    }
    if (project) perProject.set(project, (perProject.get(project) ?? 0) + 1);
    picked.push(s);
  }

  const filled = [...picked, ...heldBack.slice(0, SHORTLIST_SIZE - picked.length)];
  // Keep ranking order, so the prompt still reads highest score first.
  return filled.sort((a, b) => ranked.indexOf(a) - ranked.indexOf(b));
}

/**
 * Score every candidate and return the ranked list plus the shortlist Claude
 * chooses from.
 *
 * Candidates are expected to be pre-filtered: assigned to TP, open, and not
 * blocked by another open issue. Any still-blocked issue is dropped here as a
 * backstop.
 */
export function scoreAll(
  candidates: Candidate[],
  ctx: ScoringContext,
  baseWeights: FactorScores = DEFAULT_WEIGHTS,
): ScoringResult {
  const eligible = candidates.filter((c) => !c.issue.isBlocked);

  const targetedCount = eligible.filter((c) => Boolean(c.project?.targetDate)).length;
  const degraded = targetedCount < targetedThreshold(eligible.length);
  const weights = degraded ? renormalise(baseWeights) : baseWeights;

  const ranked = eligible
    .map((candidate): ScoredCandidate => {
      const factors: FactorScores = {
        goalLeverage: goalLeverage(candidate),
        deadlinePressure: deadlinePressure(candidate, ctx.today),
        unblocksOthers: unblocksOthers(candidate),
        momentum: momentum(candidate, ctx),
      };

      const contributions = Object.fromEntries(
        (Object.keys(factors) as FactorName[]).map((k) => [k, factors[k] * weights[k]]),
      ) as FactorScores;

      const total = Object.values(contributions).reduce((a, b) => a + b, 0);

      return {
        candidate,
        total,
        factors,
        contributions,
        carryOverDays: ctx.carryOver[candidate.issue.id] ?? 0,
      };
    })
    // Ties break on identifier so the same inputs always produce the same brief.
    .sort((a, b) => b.total - a.total || a.candidate.issue.identifier.localeCompare(b.candidate.issue.identifier));

  return {
    ranked,
    shortlist: buildShortlist(ranked),
    weights,
    degraded,
    targetedCount,
  };
}

/** True once an issue has been carried over long enough to warrant splitting it. */
export function needsSplitPrompt(carryOverDays: number): boolean {
  return carryOverDays >= CARRYOVER_SPLIT_THRESHOLD;
}
