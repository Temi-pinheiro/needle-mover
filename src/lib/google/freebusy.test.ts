import { describe, expect, it } from "vitest";
import { computeFreeBlocks, largestFreeBlock, mergeBusy } from "./freebusy";

const T = (h: number, m = 0) =>
  `2026-09-16T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00.000Z`;

const WINDOW_START = T(8);
const WINDOW_END = T(19);

describe("mergeBusy", () => {
  it("merges overlapping meetings", () => {
    expect(mergeBusy([{ start: T(9), end: T(11) }, { start: T(10), end: T(12) }])).toEqual([
      { start: T(9), end: T(12) },
    ]);
  });

  it("merges back-to-back meetings into one wall of busy", () => {
    expect(mergeBusy([{ start: T(9), end: T(10) }, { start: T(10), end: T(11) }])).toEqual([
      { start: T(9), end: T(11) },
    ]);
  });

  it("sorts out-of-order input and drops zero-length entries", () => {
    expect(
      mergeBusy([{ start: T(14), end: T(15) }, { start: T(9), end: T(9) }, { start: T(10), end: T(11) }]),
    ).toEqual([{ start: T(10), end: T(11) }, { start: T(14), end: T(15) }]);
  });
});

describe("computeFreeBlocks", () => {
  it("returns the whole window when nothing is booked", () => {
    const [block] = computeFreeBlocks([], WINDOW_START, WINDOW_END);
    expect(block).toEqual({ start: WINDOW_START, end: WINDOW_END, hours: 11 });
  });

  it("returns gaps around meetings, longest first", () => {
    const blocks = computeFreeBlocks(
      [{ start: T(9), end: T(10) }, { start: T(13), end: T(14) }],
      WINDOW_START,
      WINDOW_END,
    );
    expect(blocks.map((b) => [b.start, b.end])).toEqual([
      [T(14), T(19)], // 5h
      [T(10), T(13)], // 3h
      [T(8), T(9)], // 1h
    ]);
  });

  it("clips meetings that straddle the window edges", () => {
    const blocks = computeFreeBlocks([{ start: T(6), end: T(9) }], WINDOW_START, WINDOW_END);
    expect(blocks).toEqual([{ start: T(9), end: T(19), hours: 10 }]);
  });

  it("ignores meetings entirely outside the window", () => {
    const blocks = computeFreeBlocks([{ start: T(20), end: T(22) }], WINDOW_START, WINDOW_END);
    expect(blocks).toEqual([{ start: WINDOW_START, end: WINDOW_END, hours: 11 }]);
  });

  it("returns nothing when the day is fully booked", () => {
    expect(computeFreeBlocks([{ start: T(8), end: T(19) }], WINDOW_START, WINDOW_END)).toEqual([]);
  });

  it("drops slivers too short to focus in", () => {
    const blocks = computeFreeBlocks(
      [{ start: T(8), end: T(9) }, { start: T(9, 15), end: T(19) }],
      WINDOW_START,
      WINDOW_END,
    );
    expect(blocks).toEqual([]); // the only gap is 15 minutes
  });

  it("returns nothing for an inverted or empty window", () => {
    expect(computeFreeBlocks([], WINDOW_END, WINDOW_START)).toEqual([]);
    expect(computeFreeBlocks([], WINDOW_START, WINDOW_START)).toEqual([]);
  });

  it("prefers the earlier block when two are equally long", () => {
    const blocks = computeFreeBlocks(
      [{ start: T(10), end: T(11) }],
      T(8),
      T(13),
    );
    expect(blocks[0].start).toBe(T(8)); // 8–10 and 11–13 are both 2h
  });
});

describe("largestFreeBlock", () => {
  it("is null on a fully booked day rather than throwing", () => {
    expect(largestFreeBlock([])).toBeNull();
  });

  it("is the first block, since blocks are sorted longest first", () => {
    const blocks = computeFreeBlocks([{ start: T(9), end: T(10) }], WINDOW_START, WINDOW_END);
    expect(largestFreeBlock(blocks)?.hours).toBe(9);
  });
});
