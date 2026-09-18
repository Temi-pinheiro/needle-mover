import type { Day, DayEvent } from "@/lib/db/types";

/**
 * What the Now view should be showing.
 *
 * Derived from the event log rather than stored on the day row: "blocked" is a
 * thing that happened at a time, and the recap needs that anyway. Adding a
 * column would mean the same fact recorded twice, able to disagree.
 */

export type NowState = {
  /** The issue the card should show — the backup once the needle mover is blocked. */
  activeIssueId: string | null;
  /** True when the card is showing the backup rather than the needle mover. */
  showingBackup: boolean;
  needleMoverBlocked: boolean;
  blockReason: string | null;
  /** The active issue has been started in Linear. */
  started: boolean;
  /** The active issue has been completed. */
  done: boolean;
  /** The needle mover itself was completed — what the recap reports on. */
  needleMoverDone: boolean;
};

/** Started and done for one issue, whichever issue it is. */
export type IssueState = { started: boolean; done: boolean };

/**
 * State for every issue mentioned in the day's events.
 *
 * The Now card needs this for the active task, and each "also today" row needs
 * it for itself — a Start button that does not know the task is already
 * started is worse than no button.
 */
export function issueStates(events: DayEvent[]): Map<string, IssueState> {
  const states = new Map<string, IssueState>();

  for (const event of events) {
    if (!event.issue_id) continue;
    const current = states.get(event.issue_id) ?? { started: false, done: false };
    if (event.type === "started") current.started = true;
    if (event.type === "done") current.done = true;
    states.set(event.issue_id, current);
  }

  return states;
}

export function nowState(day: Day, events: DayEvent[]): NowState {
  const ordered = [...events].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );

  const forIssue = (id: string | null, type: DayEvent["type"]) =>
    id ? ordered.filter((e) => e.type === type && e.issue_id === id) : [];

  const needleMover = day.needle_mover_id;
  const blocked = forIssue(needleMover, "blocked");
  const needleMoverDone = forIssue(needleMover, "done").length > 0;

  // A blocked needle mover hands the day to the backup — unless it was
  // finished anyway, in which case the block is history.
  const needleMoverBlocked = blocked.length > 0 && !needleMoverDone;
  const showingBackup = needleMoverBlocked && Boolean(day.backup_id);
  const activeIssueId = showingBackup ? day.backup_id : needleMover;

  return {
    activeIssueId,
    showingBackup,
    needleMoverBlocked,
    blockReason: blocked.at(-1)?.note ?? null,
    started: forIssue(activeIssueId, "started").length > 0,
    done: forIssue(activeIssueId, "done").length > 0,
    needleMoverDone,
  };
}
