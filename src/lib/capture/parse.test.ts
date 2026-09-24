import { describe, expect, it } from "vitest";
import { buildCapturePrompt, renderCalendar } from "./parse";

describe("buildCapturePrompt", () => {
  it("gives a calendar so relative dates are looked up, and every venture's projects", () => {
    const prompt = buildCapturePrompt(
      "send dayo the deck by friday",
      [
        { id: "a", name: "Northbound", projects: [{ id: "p", name: "Public launch", targetDate: "2026-10-01" }] },
        { id: "b", name: "Halyard", projects: [] },
      ],
      "2026-09-22",
    );
    expect(prompt).toContain("Tuesday 2026-09-22 (today)");
    expect(prompt).toContain("  - Public launch (target 2026-10-01)");
    expect(prompt).toContain("Halyard\n  (no active projects)");
    expect(prompt.endsWith("send dayo the deck by friday")).toBe(true);
  });
});

describe("renderCalendar", () => {
  it("names each of the next fourteen days", () => {
    const lines = renderCalendar("2026-09-22").split("\n");
    expect(lines).toHaveLength(14);
    expect(lines[0]).toBe("Tuesday 2026-09-22 (today)");
    expect(lines[1]).toBe("Wednesday 2026-09-23 (tomorrow)");
    expect(lines[3]).toBe("Friday 2026-09-25");
  });

  it("crosses a month end", () => {
    expect(renderCalendar("2026-09-29", 3).split("\n")[2]).toBe("Thursday 2026-10-01");
  });
});
