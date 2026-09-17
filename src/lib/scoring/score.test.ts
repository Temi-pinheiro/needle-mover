import { describe, expect, it } from "vitest";
import {
  calendarFit,
  deadlinePressure,
  goalLeverage,
  momentum,
  scoreAll,
  unblocksOthers,
} from "./score";
import { DEFAULT_WEIGHTS, SHORTLIST_SIZE, targetedThreshold } from "./weights";
import type { Candidate, CandidateIssue, CandidateProject, ScoringContext } from "./types";

const TODAY = "2026-09-16";

function issue(over: Partial<CandidateIssue> = {}): CandidateIssue {
  return {
    id: over.id ?? "i1",
    identifier: over.identifier ?? "MEN-1",
    title: "Do the thing",
    workspaceId: "w1",
    ventureName: "Meridian",
    priority: 3,
    estimate: null,
    dueDate: null,
    stateType: "unstarted",
    blocksCount: 0,
    isBlocked: false,
    ...over,
  };
}

function project(over: Partial<CandidateProject> = {}): CandidateProject {
  return {
    id: "p1",
    name: "Launch pricing",
    targetDate: "2026-10-16",
    progress: 0.4,
    scopeEstimate: 20,
    ...over,
  };
}

const ctx = (over: Partial<ScoringContext> = {}): ScoringContext => ({
  today: TODAY,
  largestFreeBlockHours: 3,
  carryOver: {},
  ...over,
});

describe("goalLeverage", () => {
  it("is zero outside a targeted project", () => {
    expect(goalLeverage({ issue: issue(), project: null })).toBe(0);
    expect(goalLeverage({ issue: issue(), project: project({ targetDate: null }) })).toBe(0);
  });

  it("rewards priority and scope share", () => {
    const urgentBig = goalLeverage({
      issue: issue({ priority: 1, estimate: 10 }),
      project: project({ scopeEstimate: 20 }),
    });
    const lowSmall = goalLeverage({
      issue: issue({ priority: 4, estimate: 1 }),
      project: project({ scopeEstimate: 20 }),
    });
    expect(urgentBig).toBeGreaterThan(lowSmall);
  });

  it("treats a missing estimate as neutral, not as zero contribution", () => {
    const noEstimate = goalLeverage({ issue: issue({ priority: 1 }), project: project() });
    const tinyEstimate = goalLeverage({
      issue: issue({ priority: 1, estimate: 0.1 }),
      project: project({ scopeEstimate: 100 }),
    });
    expect(noEstimate).toBeGreaterThan(tinyEstimate);
  });
});

describe("deadlinePressure", () => {
  it("is zero with no dates at all", () => {
    expect(deadlinePressure({ issue: issue(), project: null }, TODAY)).toBe(0);
  });

  it("saturates when overdue", () => {
    expect(deadlinePressure({ issue: issue({ dueDate: "2026-09-10" }), project: null }, TODAY)).toBe(1);
  });

  it("decays with distance", () => {
    const soon = deadlinePressure({ issue: issue({ dueDate: "2026-09-18" }), project: null }, TODAY);
    const later = deadlinePressure({ issue: issue({ dueDate: "2026-10-10" }), project: null }, TODAY);
    expect(soon).toBeGreaterThan(later);
  });

  it("takes the nearest of issue due date and project target date", () => {
    const c = { issue: issue({ dueDate: "2026-10-10" }), project: project({ targetDate: "2026-09-17" }) };
    const nearestOnly = deadlinePressure({ issue: issue({ dueDate: "2026-09-17" }), project: null }, TODAY);
    expect(deadlinePressure(c, TODAY)).toBeCloseTo(nearestOnly);
  });
});

describe("unblocksOthers", () => {
  it("saturates at the threshold", () => {
    expect(unblocksOthers({ issue: issue({ blocksCount: 0 }), project: null })).toBe(0);
    expect(unblocksOthers({ issue: issue({ blocksCount: 3 }), project: null })).toBe(1);
    expect(unblocksOthers({ issue: issue({ blocksCount: 9 }), project: null })).toBe(1);
  });
});

describe("momentum", () => {
  it("rewards work already in progress", () => {
    expect(momentum({ issue: issue({ stateType: "started" }), project: null }, ctx())).toBeGreaterThan(
      momentum({ issue: issue({ stateType: "unstarted" }), project: null }, ctx()),
    );
  });

  it("compounds with carry-over days", () => {
    const c = { issue: issue({ id: "carried" }), project: null };
    const one = momentum(c, ctx({ carryOver: { carried: 1 } }));
    const two = momentum(c, ctx({ carryOver: { carried: 2 } }));
    expect(two).toBeGreaterThan(one);
  });
});

describe("calendarFit", () => {
  it("is neutral when the calendar or the estimate is unknown", () => {
    expect(calendarFit({ issue: issue({ estimate: 2 }), project: null }, ctx({ largestFreeBlockHours: null }))).toBe(0.5);
    expect(calendarFit({ issue: issue({ estimate: null }), project: null }, ctx())).toBe(0.5);
  });

  it("saturates when the free block covers the estimate", () => {
    // 1 point * 1.5 h/point = 1.5h needed, 3h free.
    expect(calendarFit({ issue: issue({ estimate: 1 }), project: null }, ctx({ largestFreeBlockHours: 3 }))).toBe(1);
  });

  it("penalises an estimate that will not fit", () => {
    const fit = calendarFit({ issue: issue({ estimate: 8 }), project: null }, ctx({ largestFreeBlockHours: 3 }));
    expect(fit).toBeGreaterThan(0);
    expect(fit).toBeLessThan(1);
  });
});

describe("scoreAll", () => {
  const targeted = (n: number): Candidate[] =>
    Array.from({ length: n }, (_, i) => ({
      issue: issue({ id: `t${i}`, identifier: `MEN-${i}` }),
      project: project({ id: `p${i}` }),
    }));

  it("drops issues that are still blocked", () => {
    const result = scoreAll(
      [
        { issue: issue({ id: "open" }), project: null },
        { issue: issue({ id: "blocked", isBlocked: true }), project: null },
      ],
      ctx(),
    );
    expect(result.ranked.map((r) => r.candidate.issue.id)).toEqual(["open"]);
  });

  /** `withTarget` of them sit in a targeted project; the rest do not. */
  const mix = (withTarget: number, without: number): Candidate[] => [
    ...targeted(withTarget),
    ...Array.from({ length: without }, (_, i) => ({
      issue: issue({ id: `u${i}`, identifier: `UNT-${i}` }),
      project: null,
    })),
  ];

  it("keeps the spec weights when enough candidates are in targeted projects", () => {
    // 4 of 7 clears the half-the-backlog test.
    const result = scoreAll(mix(4, 3), ctx());
    expect(result.degraded).toBe(false);
    expect(result.weights).toEqual(DEFAULT_WEIGHTS);
  });

  it("renormalises goal leverage away when targeted projects are scarce", () => {
    // 2 of 7 does not: one targeted issue would collect 35% unopposed.
    const result = scoreAll(mix(2, 5), ctx());
    expect(result.degraded).toBe(true);
    expect(result.weights.goalLeverage).toBe(0);
    const sum = Object.values(result.weights).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1);
  });

  it("scales the requirement with the backlog rather than using a fixed floor", () => {
    // The old absolute floor of 8 was unreachable for a seven-issue backlog,
    // so goal leverage could never switch on however well projects were kept.
    expect(targetedThreshold(7)).toBe(4);
    expect(targetedThreshold(20)).toBe(10);
    expect(scoreAll(mix(4, 3), ctx()).degraded).toBe(false);
  });

  it("never demands more targeted candidates than exist", () => {
    expect(targetedThreshold(2)).toBe(2);
    expect(targetedThreshold(0)).toBe(0);
    expect(scoreAll(mix(2, 0), ctx()).degraded).toBe(false);
  });

  it("preserves the relative order of the surviving weights when renormalising", () => {
    const { weights } = scoreAll(mix(0, 6), ctx());
    expect(weights.deadlinePressure).toBeGreaterThan(weights.unblocksOthers);
    expect(weights.unblocksOthers).toBeCloseTo(weights.momentum);
    expect(weights.momentum).toBeGreaterThan(weights.calendarFit);
  });

  it("caps the shortlist", () => {
    const result = scoreAll(targeted(SHORTLIST_SIZE + 10), ctx());
    expect(result.ranked).toHaveLength(SHORTLIST_SIZE + 10);
    expect(result.shortlist).toHaveLength(SHORTLIST_SIZE);
  });

  it("breaks ties deterministically so the same inputs give the same brief", () => {
    const tied: Candidate[] = [
      { issue: issue({ id: "b", identifier: "MEN-9" }), project: null },
      { issue: issue({ id: "a", identifier: "MEN-2" }), project: null },
    ];
    expect(scoreAll(tied, ctx()).ranked.map((r) => r.candidate.issue.identifier)).toEqual([
      "MEN-2",
      "MEN-9",
    ]);
  });

  it("ranks an overdue, unblocking, in-progress issue above a quiet one", () => {
    const hot: Candidate = {
      issue: issue({ id: "hot", identifier: "MEN-100", priority: 1, dueDate: "2026-09-01", blocksCount: 4, stateType: "started", estimate: 2 }),
      project: project(),
    };
    const quiet: Candidate = {
      issue: issue({ id: "quiet", identifier: "MEN-101", priority: 4, estimate: 2 }),
      project: project({ targetDate: "2027-06-01" }),
    };
    const result = scoreAll([quiet, hot], ctx());
    expect(result.ranked[0].candidate.issue.id).toBe("hot");
  });

  it("reports contributions that sum to the total", () => {
    const [top] = scoreAll(targeted(10), ctx()).ranked;
    const sum = Object.values(top.contributions).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(top.total);
  });
});
