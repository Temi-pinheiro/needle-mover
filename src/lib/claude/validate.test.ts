import { describe, expect, it } from "vitest";
import { PickError, resolvePick } from "./validate";
import type { ScoredCandidate } from "@/lib/scoring/types";
import type { Pick } from "./schema";

function scored(identifier: string, venture: string, over: { blocked?: boolean; total?: number } = {}): ScoredCandidate {
  return {
    candidate: {
      issue: {
        id: `id-${identifier}`,
        identifier,
        title: `Task ${identifier}`,
        workspaceId: `ws-${venture}`,
        ventureName: venture,
        priority: 2,
        estimate: 2,
        dueDate: null,
        stateType: "unstarted",
        blocksCount: 0,
        isBlocked: over.blocked ?? false,
      },
      project: null,
    },
    total: over.total ?? 0.5,
    factors: { goalLeverage: 0, deadlinePressure: 0, unblocksOthers: 0, momentum: 0, calendarFit: 0 },
    contributions: { goalLeverage: 0, deadlinePressure: 0, unblocksOthers: 0, momentum: 0, calendarFit: 0 },
    carryOverDays: 0,
  };
}

const shortlist = [
  scored("MEN-1", "Meridian", { total: 0.9 }),
  scored("MEN-2", "Meridian", { total: 0.8 }),
  scored("ACM-1", "Acme", { total: 0.7 }),
  scored("ACM-2", "Acme", { total: 0.6 }),
  scored("ZED-1", "Zed", { total: 0.5 }),
  scored("ZED-2", "Zed", { total: 0.4 }),
];

const pick = (over: Partial<Pick> = {}): Pick => ({
  needle_mover: "MEN-1",
  backup: "ACM-1",
  reason: "It is the only thing that moves the launch target this week.",
  first_step: "Open the pricing doc and list three tiers.",
  also_today: [],
  plain_focus: "Deep work on a new product launch.",
  ...over,
});

describe("resolvePick", () => {
  it("resolves a clean pick with no repairs", () => {
    const r = resolvePick(pick({ also_today: ["MEN-2", "ACM-2"] }), shortlist);
    expect(r.needleMover.candidate.issue.identifier).toBe("MEN-1");
    expect(r.backup?.candidate.issue.identifier).toBe("ACM-1");
    expect(r.alsoToday.map((a) => a.candidate.issue.identifier)).toEqual(["MEN-2", "ACM-2"]);
    expect(r.repairs).toEqual([]);
  });

  it("throws when the needle mover is not on the shortlist", () => {
    expect(() => resolvePick(pick({ needle_mover: "GHOST-1" }), shortlist)).toThrow(PickError);
  });

  it("throws on an empty shortlist rather than inventing a day", () => {
    expect(() => resolvePick(pick(), [])).toThrow(PickError);
  });

  it("substitutes the next-best issue when the backup is unknown", () => {
    const r = resolvePick(pick({ backup: "GHOST-2" }), shortlist);
    expect(r.backup?.candidate.issue.identifier).toBe("MEN-2");
    expect(r.repairs.join(" ")).toMatch(/not on the shortlist/);
  });

  it("substitutes when the backup repeats the needle mover", () => {
    const r = resolvePick(pick({ backup: "MEN-1" }), shortlist);
    expect(r.backup?.candidate.issue.identifier).toBe("MEN-2");
    expect(r.repairs.join(" ")).toMatch(/matched the needle mover/);
  });

  it("never substitutes a blocked issue as the backup", () => {
    const list = [shortlist[0], scored("MEN-9", "Meridian", { blocked: true }), shortlist[2]];
    const r = resolvePick(pick({ backup: "GHOST" }), list);
    expect(r.backup?.candidate.issue.identifier).toBe("ACM-1");
  });

  it("leaves the backup null when nothing else is startable", () => {
    const r = resolvePick(pick({ backup: "GHOST" }), [shortlist[0]]);
    expect(r.backup).toBeNull();
  });

  it("drops also-today items that are unknown, duplicated or already chosen", () => {
    const r = resolvePick(
      pick({ also_today: ["MEN-1", "ACM-1", "MEN-2", "MEN-2", "GHOST"] }),
      shortlist,
    );
    expect(r.alsoToday.map((a) => a.candidate.issue.identifier)).toEqual(["MEN-2"]);
    expect(r.repairs.join(" ")).toMatch(/unusable/);
  });

  it("allows exactly two ventures in also today", () => {
    const r = resolvePick(
      pick({ needle_mover: "MEN-1", backup: "MEN-2", also_today: ["ACM-1", "ACM-2", "ZED-1"] }),
      shortlist,
    );
    expect(r.alsoToday.map((a) => a.candidate.issue.identifier)).toEqual(["ACM-1", "ACM-2", "ZED-1"]);
    expect(r.repairs).toEqual([]);
  });

  it("drops a third venture from also today, keeping the higher-scored ones", () => {
    const list = [...shortlist, scored("QRX-1", "Quorix", { total: 0.3 })];
    const r = resolvePick(
      pick({
        needle_mover: "MEN-1",
        backup: "MEN-2",
        also_today: ["ACM-1", "ZED-1", "QRX-1", "ACM-2"],
      }),
      list,
    );
    const ventures = new Set(r.alsoToday.map((a) => a.candidate.issue.ventureName));
    expect(ventures).toEqual(new Set(["Acme", "Zed"]));
    expect(r.alsoToday.map((a) => a.candidate.issue.identifier)).toEqual(["ACM-1", "ZED-1", "ACM-2"]);
    expect(r.repairs.join(" ")).toMatch(/2 ventures/);
  });

  it("enforces the five-item cap", () => {
    const big = Array.from({ length: 8 }, (_, i) => scored(`MEN-${i + 10}`, "Meridian"));
    const list = [shortlist[0], ...big];
    const r = resolvePick(
      pick({ backup: "MEN-10", also_today: big.slice(1).map((b) => b.candidate.issue.identifier) }),
      list,
    );
    expect(r.alsoToday).toHaveLength(5);
    expect(r.repairs.join(" ")).toMatch(/5 items/);
  });

  it("flags an empty first step", () => {
    const r = resolvePick(pick({ first_step: "   " }), shortlist);
    expect(r.firstStep).toBe("");
    expect(r.repairs.join(" ")).toMatch(/first step was empty/);
  });
});
