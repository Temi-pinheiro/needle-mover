import { describe, expect, it } from "vitest";
import { buildPickPrompt, renderShortlist } from "./pick";
import type { ScoredCandidate, ScoringResult } from "@/lib/scoring/types";

const zero = { goalLeverage: 0, deadlinePressure: 0, unblocksOthers: 0, momentum: 0, calendarFit: 0 };

function scored(over: Partial<ScoredCandidate["candidate"]["issue"]> = {}, project = true, carryOverDays = 0): ScoredCandidate {
  return {
    candidate: {
      issue: {
        id: "i1",
        identifier: "MEN-14",
        title: "Ship the pricing page",
        workspaceId: "w1",
        ventureName: "Meridian",
        priority: 2,
        estimate: 3,
        dueDate: null,
        stateType: "started",
        blocksCount: 2,
        isBlocked: false,
        ...over,
      },
      project: project
        ? { id: "p1", name: "Launch pricing", targetDate: "2026-10-01", progress: 0.42, scopeEstimate: 20 }
        : null,
    },
    total: 0.62,
    factors: { ...zero, goalLeverage: 0.8 },
    contributions: { ...zero, goalLeverage: 0.28, deadlinePressure: 0.2 },
    carryOverDays,
  };
}

const scoring = (over: Partial<ScoringResult> = {}): ScoringResult => ({
  ranked: [],
  shortlist: [scored()],
  weights: zero,
  degraded: false,
  targetedCount: 12,
  ...over,
});

describe("renderShortlist", () => {
  it("shows the project target and progress so Claude can weigh leverage", () => {
    const text = renderShortlist([scored()]);
    expect(text).toContain("Launch pricing — target 2026-10-01, 42% complete");
    expect(text).toContain("unblocks 2 other issue(s)");
  });

  it("says plainly when an issue has no target to advance", () => {
    expect(renderShortlist([scored({}, false)])).toContain("no target to advance");
  });

  it("only lists factors that actually contributed", () => {
    const text = renderShortlist([scored()]);
    expect(text).toContain("goalLeverage 0.28");
    expect(text).not.toContain("momentum");
  });

  it("asks for a split once an issue has been carried over too long", () => {
    expect(renderShortlist([scored({}, true, 3)])).toContain("split into smaller issues");
    expect(renderShortlist([scored({}, true, 1)])).not.toContain("split into smaller issues");
  });
});

describe("buildPickPrompt", () => {
  const base = { today: "2026-09-16", timezone: "Africa/Lagos", freeBlocks: [], scoring: scoring() };

  it("tells Claude not to let a missing calendar decide the pick", () => {
    expect(buildPickPrompt(base)).toContain("Do not let this decide the pick");
  });

  it("lists free blocks when the calendar is available", () => {
    const prompt = buildPickPrompt({
      ...base,
      freeBlocks: [{ start: "09:00", end: "12:00", hours: 3 }],
    });
    expect(prompt).toContain("09:00–12:00 (3.0h)");
  });

  it("warns when goal leverage was renormalised away", () => {
    const prompt = buildPickPrompt({ ...base, scoring: scoring({ degraded: true, targetedCount: 2 }) });
    expect(prompt).toContain("only 2 candidate(s) belong to a project with a target date");
  });

  it("stays quiet about degradation on a healthy day", () => {
    expect(buildPickPrompt(base)).not.toContain("goal leverage was excluded");
  });
});
