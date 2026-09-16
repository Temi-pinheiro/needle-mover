/**
 * Free-block maths, kept pure so the "largest free block today" that drives
 * calendar fit and the suggested focus window is testable without Google.
 */

export type Interval = { start: string; end: string };

export type FreeBlock = {
  start: string;
  end: string;
  hours: number;
};

/** The earliest hour a focus window may start, in the user's local timezone. */
export const DAY_START_HOUR = 8;

/** Blocks shorter than this aren't worth suggesting as a focus window. */
export const MIN_BLOCK_MINUTES = 30;

const ms = (iso: string) => new Date(iso).getTime();

/** Merges overlapping and touching busy intervals into a sorted, disjoint list. */
export function mergeBusy(busy: Interval[]): Interval[] {
  const sorted = [...busy]
    .filter((b) => ms(b.end) > ms(b.start))
    .sort((a, b) => ms(a.start) - ms(b.start));

  const merged: Interval[] = [];
  for (const current of sorted) {
    const last = merged[merged.length - 1];
    if (last && ms(current.start) <= ms(last.end)) {
      // Overlapping or back-to-back: extend rather than add.
      if (ms(current.end) > ms(last.end)) last.end = current.end;
    } else {
      merged.push({ ...current });
    }
  }
  return merged;
}

/**
 * Gaps between busy intervals inside [windowStart, windowEnd], longest first.
 * Busy time outside the window is ignored; busy time straddling an edge is
 * clipped to it.
 */
export function computeFreeBlocks(
  busy: Interval[],
  windowStart: string,
  windowEnd: string,
  minMinutes = MIN_BLOCK_MINUTES,
): FreeBlock[] {
  const start = ms(windowStart);
  const end = ms(windowEnd);
  if (end <= start) return [];

  const blocks: FreeBlock[] = [];
  let cursor = start;

  for (const interval of mergeBusy(busy)) {
    const busyStart = Math.max(ms(interval.start), start);
    const busyEnd = Math.min(ms(interval.end), end);
    if (busyEnd <= start || busyStart >= end) continue; // entirely outside

    if (busyStart > cursor) {
      blocks.push(toBlock(cursor, busyStart));
    }
    cursor = Math.max(cursor, busyEnd);
  }

  if (cursor < end) blocks.push(toBlock(cursor, end));

  return blocks
    .filter((b) => b.hours * 60 >= minMinutes)
    // Longest first, earliest wins a tie — an earlier slot is a better
    // suggestion than an equally long one after lunch.
    .sort((a, b) => b.hours - a.hours || ms(a.start) - ms(b.start));
}

function toBlock(start: number, end: number): FreeBlock {
  return {
    start: new Date(start).toISOString(),
    end: new Date(end).toISOString(),
    hours: (end - start) / 3_600_000,
  };
}

/** The block to suggest as today's focus window, or null if the day is full. */
export function largestFreeBlock(blocks: FreeBlock[]): FreeBlock | null {
  return blocks[0] ?? null;
}
