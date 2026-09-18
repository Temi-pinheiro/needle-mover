import {
  CARRYOVER_SPLIT_THRESHOLD,
  DEADLINE_HORIZON_DAYS,
  DEFAULT_WEIGHTS,
  MOMENTUM_IN_PROGRESS,
  MOMENTUM_PER_CARRYOVER_DAY,
  NEUTRAL,
  PRIORITY_SCORE,
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
 * Goal leverage: how much this issue moves a project toward its target.
 *
 * Gated on the project having a target date — an issue outside a targeted
 * project scores zero, per spec. That gate is why `scoreAll` renormalises when
 * targeted projects are scarce.
 */
export function goalLeverage(c: Candidate): number {
  const { project, issue } = c;
  if (!project?.targetDate) return 0;

  const priority = PRIORITY_SCORE[issue.priority] ?? NEUTRAL;

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
    shortlist: ranked.slice(0, SHORTLIST_SIZE),
    weights,
    degraded,
    targetedCount,
  };
}

/** True once an issue has been carried over long enough to warrant splitting it. */
export function needsSplitPrompt(carryOverDays: number): boolean {
  return carryOverDays >= CARRYOVER_SPLIT_THRESHOLD;
}
