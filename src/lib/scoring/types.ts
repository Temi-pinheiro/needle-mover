/**
 * Inputs to scoring are deliberately decoupled from database rows so the
 * scorer stays pure and testable without a Supabase client.
 */

export type CandidateProject = {
  id: string;
  name: string;
  /** ISO date. The presence of this is what makes a project "targeted". */
  targetDate: string | null;
  /** 0..1, as Linear reports it. */
  progress: number;
  /** Sum of estimates across the project, used for scope share. */
  scopeEstimate: number | null;
  /**
   * Linear project priority: 0 none, 1 urgent .. 4 low. Sets the priority
   * tier in goal leverage. Null (not synced) falls back to issue priority.
   */
  priority?: number | null;
};

export type CandidateIssue = {
  id: string;
  identifier: string;
  title: string;
  workspaceId: string;
  ventureName: string;
  /** Linear priority: 0 none, 1 urgent, 2 high, 3 medium, 4 low. */
  priority: number;
  estimate: number | null;
  /** ISO date. */
  dueDate: string | null;
  /** backlog | unstarted | started | completed | canceled */
  stateType: string;
  /** How many open issues this one blocks. */
  blocksCount: number;
  isBlocked: boolean;
};

export type Candidate = {
  issue: CandidateIssue;
  project: CandidateProject | null;
};

export type ScoringContext = {
  /** Today's date in the user's timezone, as ISO yyyy-mm-dd. */
  today: string;
  /**
   * issueId -> consecutive days this issue has been an unfinished needle mover.
   * Drives both the momentum boost and the 3-day split prompt.
   */
  carryOver: Record<string, number>;
};

export type FactorName =
  | "goalLeverage"
  | "deadlinePressure"
  | "unblocksOthers"
  | "momentum";

/** Each factor resolves to 0..1 before weighting. */
export type FactorScores = Record<FactorName, number>;

export type ScoredCandidate = {
  candidate: Candidate;
  /** 0..1 weighted total. */
  total: number;
  factors: FactorScores;
  /** Per-factor contribution to the total, for the debug view. */
  contributions: FactorScores;
  /** Consecutive days carried over as an unfinished needle mover. */
  carryOverDays: number;
};

export type ScoringResult = {
  /** Every candidate, highest score first. */
  ranked: ScoredCandidate[];
  /** The top N handed to Claude. */
  shortlist: ScoredCandidate[];
  /** Weights actually applied, after any renormalisation. */
  weights: FactorScores;
  /**
   * True when too few candidates belonged to a targeted project and goal
   * leverage was renormalised away. Surfaced in the brief so a bad ranking is
   * explainable rather than mysterious.
   */
  degraded: boolean;
  /** How many candidates belonged to a project with a target date. */
  targetedCount: number;
};
