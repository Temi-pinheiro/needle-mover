import { describe, expect, it } from "vitest";
import { issueStates, nowState } from "./day-state";
import type { Day, DayEvent } from "@/lib/db/types";

const day = (over: Partial<Day> = {}): Day => ({
  id: "d1",
  date: "2026-09-16",
  timezone: "Africa/Lagos",
  needle_mover_id: "nm",
  also_today_ids: [],
  also_today_reasons: {},
  reason: "because",
  first_step: "Open the doc.",
  plain_focus: "Deep work.",
  degraded_scoring: false,
  status: "open",
  closed_at: null,
  recap_summary: null,
  recap_tomorrow_note: null,
  recap_tomorrow_id: null,
  created_at: "2026-09-16T06:00:00Z",
  ...over,
});

let clock = 0;
const event = (type: DayEvent["type"], issueId: string | null, note?: string): DayEvent => ({
  id: `e${clock}`,
  day_id: "d1",
  type,
  issue_id: issueId,
  related_issue_id: null,
  note: note ?? null,
  created_at: new Date(Date.UTC(2026, 8, 16, 8, clock++)).toISOString(),
});

describe("nowState", () => {
  it("shows the needle mover on a fresh day", () => {
    const s = nowState(day(), []);
    expect(s.activeIssueId).toBe("nm");
    expect(s.started).toBe(false);
    expect(s.done).toBe(false);
  });

  it("marks the active task started", () => {
    const s = nowState(day(), [event("started", "nm")]);
    expect(s.started).toBe(true);
  });

  it("keeps the most recent reason when blocked more than once", () => {
    const s = nowState(day(), [
      event("blocked", "nm", "first reason"),
      event("blocked", "nm", "second reason"),
    ]);
    expect(s.blockReason).toBe("second reason");
  });

  it("ignores events belonging to other issues", () => {
    const s = nowState(day(), [event("done", "someone-else")]);
    expect(s.done).toBe(false);
    expect(s.needleMoverDone).toBe(false);
  });

  it("copes with a day that has no needle mover yet", () => {
    const s = nowState(day({ needle_mover_id: null }), []);
    expect(s.activeIssueId).toBeNull();
    expect(s.started).toBe(false);
  });
});

describe("issueStates", () => {
  it("is empty when nothing has happened", () => {
    expect(issueStates([]).size).toBe(0);
  });

  it("tracks each issue independently", () => {
    const states = issueStates([
      event("started", "a"),
      event("done", "a"),
      event("started", "b"),
    ]);
    expect(states.get("a")).toEqual({ started: true, done: true });
    // b was started and not finished; a's completion must not leak onto it.
    expect(states.get("b")).toEqual({ started: true, done: false });
  });

  it("records done without started, since Done can be pressed directly", () => {
    expect(issueStates([event("done", "c")]).get("c")).toEqual({ started: false, done: true });
  });

  it("ignores events with no issue attached", () => {
    expect(issueStates([event("nudged", null)]).size).toBe(0);
  });

  it("treats an unmentioned issue as neither started nor done", () => {
    expect(issueStates([event("started", "a")]).get("never-touched")).toBeUndefined();
  });
});

describe("blocking without a backup", () => {
  it("records the block and the reason but keeps the needle mover on the card", () => {
    // There is no backup to promote any more; the three ranked tasks below
    // are the answer to a blocked needle mover.
    const s = nowState(day(), [event("blocked", "nm", "Waiting on legal")]);
    expect(s.activeIssueId).toBe("nm");
    expect(s.needleMoverBlocked).toBe(true);
    expect(s.blockReason).toBe("Waiting on legal");
  });

  it("stops reporting a block once the task was finished anyway", () => {
    const s = nowState(day(), [event("blocked", "nm", "stuck"), event("done", "nm")]);
    expect(s.needleMoverBlocked).toBe(false);
    expect(s.needleMoverDone).toBe(true);
  });
});
