import { describe, expect, it } from "vitest";
import { nowState } from "./day-state";
import type { Day, DayEvent } from "@/lib/db/types";

const day = (over: Partial<Day> = {}): Day => ({
  id: "d1",
  date: "2026-09-16",
  timezone: "Africa/Lagos",
  needle_mover_id: "nm",
  backup_id: "bk",
  also_today_ids: [],
  reason: "because",
  first_step: "Open the doc.",
  plain_focus: "Deep work.",
  focus_window_start: null,
  focus_window_end: null,
  degraded_scoring: false,
  status: "open",
  closed_at: null,
  brief_sent_at: null,
  nudge_sent_at: null,
  reminder_sent_at: null,
  recap_sent_at: null,
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
    expect(s.showingBackup).toBe(false);
    expect(s.started).toBe(false);
    expect(s.done).toBe(false);
  });

  it("marks the active task started", () => {
    const s = nowState(day(), [event("started", "nm")]);
    expect(s.started).toBe(true);
  });

  it("reveals the backup once the needle mover is blocked, carrying the reason", () => {
    const s = nowState(day(), [event("blocked", "nm", "Waiting on legal")]);
    expect(s.showingBackup).toBe(true);
    expect(s.activeIssueId).toBe("bk");
    expect(s.needleMoverBlocked).toBe(true);
    expect(s.blockReason).toBe("Waiting on legal");
  });

  it("keeps the needle mover when there is no backup to fall back to", () => {
    const s = nowState(day({ backup_id: null }), [event("blocked", "nm", "stuck")]);
    expect(s.showingBackup).toBe(false);
    expect(s.activeIssueId).toBe("nm");
    expect(s.needleMoverBlocked).toBe(true); // still reported, so the UI can say so
  });

  it("tracks started and done against the backup once it is the active task", () => {
    const s = nowState(day(), [
      event("blocked", "nm", "stuck"),
      event("started", "bk"),
      event("done", "bk"),
    ]);
    expect(s.activeIssueId).toBe("bk");
    expect(s.started).toBe(true);
    expect(s.done).toBe(true);
    expect(s.needleMoverDone).toBe(false);
  });

  it("returns to the needle mover if it got finished after being blocked", () => {
    const s = nowState(day(), [event("blocked", "nm", "stuck"), event("done", "nm")]);
    expect(s.showingBackup).toBe(false);
    expect(s.activeIssueId).toBe("nm");
    expect(s.needleMoverDone).toBe(true);
    expect(s.needleMoverBlocked).toBe(false);
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
    const s = nowState(day({ needle_mover_id: null, backup_id: null }), []);
    expect(s.activeIssueId).toBeNull();
    expect(s.started).toBe(false);
  });
});
