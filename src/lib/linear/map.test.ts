import { describe, expect, it } from "vitest";
import { deriveRelations, sumScope, toIssueRow, toProjectRow } from "./map";
import type { LinearIssueNode } from "./map";

const open = { type: "started" };
const done = { type: "completed" };

function node(over: Partial<LinearIssueNode> = {}): LinearIssueNode {
  return {
    id: "lin_1",
    identifier: "MEN-1",
    title: "Ship pricing page",
    url: "https://linear.app/x/issue/MEN-1",
    priority: 2,
    estimate: 3,
    dueDate: "2026-09-20",
    updatedAt: "2026-09-16T08:00:00.000Z",
    state: { name: "In Progress", type: "started" },
    project: { id: "lin_p1" },
    ...over,
  };
}

describe("deriveRelations", () => {
  it("counts only open issues this one blocks", () => {
    const n = node({
      relations: {
        nodes: [
          { type: "blocks", relatedIssue: { id: "a", state: open } },
          { type: "blocks", relatedIssue: { id: "b", state: done } },
          { type: "related", relatedIssue: { id: "c", state: open } },
        ],
      },
    });
    expect(deriveRelations(n).blocksCount).toBe(1);
  });

  it("is blocked only by an open blocker", () => {
    const blocked = node({
      inverseRelations: { nodes: [{ type: "blocks", issue: { id: "x", state: open } }] },
    });
    const wasBlocked = node({
      inverseRelations: { nodes: [{ type: "blocks", issue: { id: "x", state: done } }] },
    });
    expect(deriveRelations(blocked).isBlocked).toBe(true);
    expect(deriveRelations(wasBlocked).isBlocked).toBe(false);
  });

  it("ignores non-blocking relation types in both directions", () => {
    const n = node({
      relations: { nodes: [{ type: "duplicate", relatedIssue: { id: "a", state: open } }] },
      inverseRelations: { nodes: [{ type: "similar", issue: { id: "b", state: open } }] },
    });
    expect(deriveRelations(n)).toEqual({ blocksCount: 0, isBlocked: false });
  });

  it("handles issues with no relations at all", () => {
    expect(deriveRelations(node())).toEqual({ blocksCount: 0, isBlocked: false });
  });
});

describe("toIssueRow", () => {
  it("resolves the project to our own id", () => {
    const row = toIssueRow(node(), "ws1", new Map([["lin_p1", "our_p1"]]));
    expect(row.project_id).toBe("our_p1");
    expect(row.identifier).toBe("MEN-1");
  });

  it("leaves the project null when the issue has none or it is unsynced", () => {
    expect(toIssueRow(node({ project: null }), "ws1", new Map()).project_id).toBeNull();
    expect(toIssueRow(node(), "ws1", new Map()).project_id).toBeNull();
  });

  it("defaults a missing priority to none rather than to urgent", () => {
    expect(toIssueRow(node({ priority: null }), "ws1", new Map()).priority).toBe(0);
  });
});

describe("toProjectRow", () => {
  it("truncates Linear's target date to a plain date", () => {
    const row = toProjectRow(
      { id: "p", name: "Launch", state: "started", targetDate: "2026-10-16T00:00:00.000Z", progress: 0.42 },
      "ws1",
      12,
    );
    expect(row.target_date).toBe("2026-10-16");
    expect(row.progress).toBe(0.42);
  });

  it("defaults missing progress to zero", () => {
    const row = toProjectRow({ id: "p", name: "L", state: null, targetDate: null, progress: null }, "ws1", null);
    expect(row.progress).toBe(0);
    expect(row.target_date).toBeNull();
  });
});

describe("sumScope", () => {
  it("sums estimates on open issues only", () => {
    expect(
      sumScope([
        { estimate: 3, state: open },
        { estimate: 5, state: open },
        { estimate: 8, state: done },
      ]),
    ).toBe(8);
  });

  it("is null when nothing is estimated, so scope share falls back to neutral", () => {
    expect(sumScope([{ estimate: null, state: open }])).toBeNull();
    expect(sumScope([])).toBeNull();
  });
});
