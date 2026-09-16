import { describe, expect, it } from "vitest";
import { alreadyIn, pickState, type WorkflowState } from "./states";

const states: WorkflowState[] = [
  { id: "backlog", name: "Backlog", type: "backlog", position: 0 },
  { id: "todo", name: "Todo", type: "unstarted", position: 1 },
  { id: "review", name: "In Review", type: "started", position: 3 },
  { id: "progress", name: "In Progress", type: "started", position: 2 },
  { id: "done", name: "Done", type: "completed", position: 4 },
  { id: "cancelled", name: "Cancelled", type: "canceled", position: 5 },
];

describe("pickState", () => {
  it("takes the leftmost column of the requested type", () => {
    // "In Review" is also `started`; the one a person would drag to is first.
    expect(pickState(states, "started")?.id).toBe("progress");
  });

  it("finds completed regardless of what the team named it", () => {
    const shipped: WorkflowState[] = [{ id: "s", name: "Shipped", type: "completed", position: 9 }];
    expect(pickState(shipped, "completed")?.name).toBe("Shipped");
  });

  it("returns null when the team has no such state, rather than guessing", () => {
    expect(pickState([states[0]], "started")).toBeNull();
    expect(pickState([], "completed")).toBeNull();
  });
});

describe("alreadyIn", () => {
  it("lets a repeated Start be a no-op instead of an error", () => {
    expect(alreadyIn("started", "started")).toBe(true);
    expect(alreadyIn("unstarted", "started")).toBe(false);
  });
});
