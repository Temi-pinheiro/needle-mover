import { describe, expect, it } from "vitest";
import { PickError, resolvePick, shortlistRefs } from "./validate";
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
    factors: { goalLeverage: 0, deadlinePressure: 0, unblocksOthers: 0, momentum: 0 },
    contributions: { goalLeverage: 0, deadlinePressure: 0, unblocksOthers: 0, momentum: 0 },
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

/** Shorthand for an also-today entry, since only the identifier matters here. */
const also = (...identifiers: string[]) =>
  identifiers.map((identifier) => ({ identifier, reason: "worth a look" }));

const pick = (over: Partial<Pick> = {}): Pick => ({
  needle_mover: "MEN-1",
  reason: "It is the only thing that moves the launch target this week.",
  first_step: "Open the pricing doc and list three tiers.",
  also_today: [],
  plain_focus: "Deep work on a new product launch.",
  ...over,
});

describe("resolvePick", () => {
  it("resolves a clean pick with no repairs", () => {
    const r = resolvePick(pick({ also_today: also("MEN-2", "ACM-2") }), shortlist);
    expect(r.needleMover.candidate.issue.identifier).toBe("MEN-1");
    expect(r.alsoToday.map((a) => a.candidate.candidate.issue.identifier)).toEqual(["MEN-2", "ACM-2"]);
    expect(r.repairs).toEqual([]);
  });

  it("throws when the needle mover is not on the shortlist", () => {
    expect(() => resolvePick(pick({ needle_mover: "GHOST-1" }), shortlist)).toThrow(PickError);
  });

  it("throws on an empty shortlist rather than inventing a day", () => {
    expect(() => resolvePick(pick(), [])).toThrow(PickError);
  });

  it("drops also-today items that are unknown, duplicated or already chosen", () => {
    const r = resolvePick(
      pick({ also_today: also("MEN-1", "ACM-1", "MEN-2", "MEN-2", "GHOST") }),
      shortlist,
    );
    // ACM-1 survives now that there is no backup for it to collide with.
    expect(r.alsoToday.map((a) => a.candidate.candidate.issue.identifier)).toEqual([
      "ACM-1",
      "MEN-2",
    ]);
    expect(r.repairs.join(" ")).toMatch(/unusable/);
  });

  it("allows exactly two ventures in also today", () => {
    const r = resolvePick(
      pick({ needle_mover: "MEN-1", also_today: also("ACM-1", "ACM-2", "ZED-1") }),
      shortlist,
    );
    expect(r.alsoToday.map((a) => a.candidate.candidate.issue.identifier)).toEqual(["ACM-1", "ACM-2", "ZED-1"]);
    expect(r.repairs).toEqual([]);
  });

  it("drops a third venture from also today, keeping the higher-scored ones", () => {
    const list = [...shortlist, scored("QRX-1", "Quorix", { total: 0.3 })];
    const r = resolvePick(
      pick({
        needle_mover: "MEN-1",
              also_today: also("ACM-1", "ZED-1", "QRX-1", "ACM-2"),
      }),
      list,
    );
    const ventures = new Set(r.alsoToday.map((a) => a.candidate.candidate.issue.ventureName));
    expect(ventures).toEqual(new Set(["Acme", "Zed"]));
    expect(r.alsoToday.map((a) => a.candidate.candidate.issue.identifier)).toEqual(["ACM-1", "ZED-1", "ACM-2"]);
    expect(r.repairs.join(" ")).toMatch(/2 ventures/);
  });

  it("enforces the three-item cap", () => {
    const big = Array.from({ length: 8 }, (_, i) => scored(`MEN-${i + 10}`, "Meridian"));
    const list = [shortlist[0], ...big];
    const r = resolvePick(
      pick({ also_today: also(...big.slice(1).map((b) => b.candidate.issue.identifier)) }),
      list,
    );
    expect(r.alsoToday).toHaveLength(3);
    expect(r.repairs.join(" ")).toMatch(/3 items/);
  });

  it("flags an empty first step", () => {
    const r = resolvePick(pick({ first_step: "   " }), shortlist);
    expect(r.firstStep).toBe("");
    expect(r.repairs.join(" ")).toMatch(/first step was empty/);
  });
});

describe("identifiers across separate Linear organisations", () => {
  // Two ventures in different organisations can each have a team keyed ENG,
  // so both produce ENG-1. Without qualification one silently overwrites the
  // other and the pick resolves to the wrong issue.
  const collided = [
    scored("ENG-1", "Meridian", { total: 0.9 }),
    scored("ENG-1", "Northbound", { total: 0.4 }),
    scored("MEN-2", "Meridian", { total: 0.8 }),
  ];

  it("leaves identifiers bare when nothing collides", () => {
    const { qualified, refOf } = shortlistRefs(shortlist);
    expect(qualified).toBe(false);
    expect(refOf(shortlist[0])).toBe("MEN-1");
  });

  it("qualifies every identifier once any of them collide", () => {
    const { qualified, refOf } = shortlistRefs(collided);
    expect(qualified).toBe(true);
    expect(refOf(collided[0])).toBe("Meridian/ENG-1");
    // Qualification is all-or-nothing, so the prompt never mixes two forms.
    expect(refOf(collided[2])).toBe("Meridian/MEN-2");
  });

  it("keeps both colliding entries reachable", () => {
    const { byRef } = shortlistRefs(collided);
    expect(byRef.size).toBe(3);
    expect(byRef.get("Northbound/ENG-1")?.candidate.issue.ventureName).toBe("Northbound");
  });

  it("resolves a qualified pick to the right venture", () => {
    const r = resolvePick(
      pick({ needle_mover: "Northbound/ENG-1" }),
      collided,
    );
    expect(r.needleMover.candidate.issue.ventureName).toBe("Northbound");
    expect(r.repairs).toEqual([]);
  });

  it("falls back to the higher-scored entry when Claude drops the prefix", () => {
    const r = resolvePick(pick({ needle_mover: "ENG-1" }), collided);
    expect(r.needleMover.candidate.issue.ventureName).toBe("Meridian");
    expect(r.repairs.join(" ")).toMatch(/ambiguous across ventures/);
  });

  it("still throws for an identifier on no shortlist entry at all", () => {
    expect(() => resolvePick(pick({ needle_mover: "GHOST-1" }), collided)).toThrow(PickError);
  });
});
