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
 * Linear estimates are points, not hours. This converts them so calendar fit
 * can compare an estimate against a free block. Tune once you know your own
 * pointing habits.
 */
export const HOURS_PER_ESTIMATE_POINT = 1.5;

/**
 * Below this many candidates in a targeted project, goal leverage is measuring
 * noise — it gets renormalised away rather than silently zeroing 35% of the
 * score for nearly every candidate.
 */
export const MIN_TARGETED_CANDIDATES = 8;

/** How many candidates go to Claude. */
export const SHORTLIST_SIZE = 15;

/**
 * Neutral value for a factor whose input is missing. Deliberately mid-scale:
 * a missing estimate or an unreachable calendar should not be a penalty.
 */
export const NEUTRAL = 0.5;
