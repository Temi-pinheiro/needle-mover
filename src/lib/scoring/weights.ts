import type { FactorScores } from "./types";

/**
 * Weights, renormalised after calendar fit was removed.
 *
 * The spec's original five were 35/25/15/15/10. Dropping the calendar meant
 * redistributing its 10% proportionally rather than picking new numbers, so
 * the relative ordering the spec reasoned about is preserved exactly.
 *
 * Meant to be tuned from the swap log later — nothing else should hardcode a
 * weight.
 */
export const DEFAULT_WEIGHTS: FactorScores = {
  goalLeverage: 0.389,
  deadlinePressure: 0.278,
  unblocksOthers: 0.167,
  momentum: 0.166,
};

/** Linear priority (0 none, 1 urgent … 4 low) mapped onto 0..1. */
export const PRIORITY_SCORE: Record<number, number> = {
  0: 0.1, // none — not zero, so an unprioritised issue is not unrankable
  1: 1.0, // urgent
  2: 0.75, // high
  3: 0.5, // medium
  4: 0.25, // low
};

/**
 * How much issue priority can move an issue within its project's priority
 * tier. Kept below the gap between tiers, so issue priority orders work inside
 * a project but can never lift a lower-priority project over a higher one.
 * See `priorityTerm`.
 */
export const ISSUE_PRIORITY_WITHIN_TIER = 0.15;

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
 * No project takes more than this many shortlist places.
 *
 * Scores between projects of equal priority and deadline are nearly flat, so
 * a plain top 15 is decided by backlog size: on 2026-09-24 Bord (38 open
 * issues) and Building Klaw filled all fifteen, and Needle Mover — equally
 * urgent, due the same day — was never shown to Claude at all. Five is enough
 * for Claude to choose well within one project, and leaves room for three.
 */
export const SHORTLIST_MAX_PER_PROJECT = 5;

/**
 * Neutral value for a factor whose input is missing. Deliberately mid-scale:
 * a missing estimate or an unreachable calendar should not be a penalty.
 */
export const NEUTRAL = 0.5;
