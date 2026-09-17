import type { FactorScores } from "./types";

/**
 * Starting weights from the spec. These are meant to be tuned from the swap
 * log in Phase 5 — nothing else in the codebase should hardcode a weight.
 */
export const DEFAULT_WEIGHTS: FactorScores = {
  goalLeverage: 0.35,
  deadlinePressure: 0.25,
  unblocksOthers: 0.15,
  momentum: 0.15,
  calendarFit: 0.1,
};

/** Linear priority (0 none, 1 urgent … 4 low) mapped onto 0..1. */
export const PRIORITY_SCORE: Record<number, number> = {
  0: 0.1, // none — not zero, so an unprioritised issue is not unrankable
  1: 1.0, // urgent
  2: 0.75, // high
  3: 0.5, // medium
  4: 0.25, // low
};

/** Deadline pressure decays to zero this many days out. */
export const DEADLINE_HORIZON_DAYS = 30;

/** Blocking this many issues saturates the unblocks-others factor. */
export const UNBLOCKS_SATURATION = 3;

/** An issue already in progress carries this much momentum on its own. */
export const MOMENTUM_IN_PROGRESS = 0.6;

/** Each consecutive carry-over day adds this much momentum, on top. */
export const MOMENTUM_PER_CARRYOVER_DAY = 0.2;

/** After this many days unfinished, the brief asks TP to split or drop it. */
export const CARRYOVER_SPLIT_THRESHOLD = 3;

/**
 * Hours of real work per estimate point, for calendar fit.
 *
 * A single multiplier is right for Fibonacci: the scale is built so the number
 * already tracks relative effort, so 8 really is about four times 2. (It would
 * have been wrong for t-shirt sizes, where the numbers rise linearly while the
 * effort they stand for does not.)
 *
 * This is the one number here that cannot be derived — it depends on what one
 * point means to you in practice.
 */
export const HOURS_PER_ESTIMATE_POINT = 1.5;

/**
 * Goal leverage only counts when enough of the backlog sits in a targeted
 * project for the comparison to mean anything. If one issue out of seven has a
 * target, that issue collects 35% of the score unopposed — which is a
 * distortion, not a signal.
 *
 * The test is proportional, not absolute. An absolute floor of 8 was
 * unreachable for a seven-issue backlog: goal leverage could never switch on,
 * however well the projects were maintained.
 */
export const TARGETED_SHARE = 0.5;

/** …but a share of a tiny backlog is still too few to compare. */
export const MIN_TARGETED_FLOOR = 3;

/** How many candidates must be in a targeted project for goal leverage to count. */
export function targetedThreshold(candidateCount: number): number {
  if (candidateCount === 0) return 0;
  return Math.min(
    candidateCount,
    Math.max(MIN_TARGETED_FLOOR, Math.ceil(candidateCount * TARGETED_SHARE)),
  );
}

/** How many candidates go to Claude. */
export const SHORTLIST_SIZE = 15;

/**
 * Neutral value for a factor whose input is missing. Deliberately mid-scale:
 * a missing estimate or an unreachable calendar should not be a penalty.
 */
export const NEUTRAL = 0.5;
