import { describe, expect, it } from "vitest";
import {
  addDays,
  hasPassed,
  isValidTimezone,
  isWeekend,
  localDate,
  localInstant,
  localMinutes,
  localTime,
} from "./time";

const LAGOS = "Africa/Lagos"; // UTC+1 year round
const BALI = "Asia/Makassar"; // UTC+8 year round
const NY = "America/New_York"; // UTC-5/-4, observes DST

describe("localDate", () => {
  it("gives the same instant different dates either side of the dateline", () => {
    // 23:30 UTC is already tomorrow in Bali, still today in Lagos.
    const instant = new Date("2026-09-16T23:30:00Z");
    expect(localDate(instant, LAGOS)).toBe("2026-09-17"); // 00:30 next day
    expect(localDate(instant, BALI)).toBe("2026-09-17"); // 07:30 next day
    expect(localDate(instant, "UTC")).toBe("2026-09-16");
  });

  it("rolls the date back for a western zone", () => {
    const instant = new Date("2026-09-16T02:00:00Z");
    expect(localDate(instant, NY)).toBe("2026-09-15"); // 22:00 previous day
  });
});

describe("localTime and localMinutes", () => {
  it("reports wall-clock time in the given zone", () => {
    const instant = new Date("2026-09-16T06:00:00Z");
    expect(localTime(instant, LAGOS)).toBe("07:00");
    expect(localTime(instant, BALI)).toBe("14:00");
    expect(localMinutes(instant, LAGOS)).toBe(7 * 60);
  });

  it("uses a 24-hour clock rather than 12-hour with a suffix", () => {
    expect(localTime(new Date("2026-09-16T23:00:00Z"), "UTC")).toBe("23:00");
    expect(localTime(new Date("2026-09-16T00:30:00Z"), "UTC")).toBe("00:30");
  });
});

describe("localInstant", () => {
  it("resolves a local brief time to the right UTC instant", () => {
    // 07:00 in Lagos (UTC+1) is 06:00 UTC.
    expect(localInstant("2026-09-16", "07:00", LAGOS).toISOString()).toBe("2026-09-16T06:00:00.000Z");
    // 07:00 in Bali (UTC+8) is 23:00 UTC the day before.
    expect(localInstant("2026-09-16", "07:00", BALI).toISOString()).toBe("2026-09-15T23:00:00.000Z");
  });

  it("round-trips through localDate and localTime", () => {
    for (const tz of [LAGOS, BALI, NY, "UTC"]) {
      const instant = localInstant("2026-09-16", "14:30", tz);
      expect(localDate(instant, tz)).toBe("2026-09-16");
      expect(localTime(instant, tz)).toBe("14:30");
    }
  });

  it("gets the offset right on both sides of a DST transition", () => {
    // US DST ends 2026-11-01. Before: UTC-4, after: UTC-5.
    expect(localInstant("2026-10-30", "09:00", NY).toISOString()).toBe("2026-10-30T13:00:00.000Z");
    expect(localInstant("2026-11-03", "09:00", NY).toISOString()).toBe("2026-11-03T14:00:00.000Z");
  });
});

describe("hasPassed", () => {
  it("is false before the time and true after, in local terms", () => {
    const sixThirtyLagos = new Date("2026-09-16T05:30:00Z"); // 06:30 in Lagos
    expect(hasPassed(sixThirtyLagos, "07:00", LAGOS)).toBe(false);
    expect(hasPassed(new Date("2026-09-16T06:00:00Z"), "07:00", LAGOS)).toBe(true);
  });

  it("is true exactly at the boundary, so a tick landing on the minute fires", () => {
    expect(hasPassed(new Date("2026-09-16T06:00:00Z"), "07:00", LAGOS)).toBe(true);
  });

  it("answers differently for the same instant in two zones", () => {
    const instant = new Date("2026-09-16T06:00:00Z"); // 07:00 Lagos, 14:00 Bali
    expect(hasPassed(instant, "13:00", LAGOS)).toBe(false);
    expect(hasPassed(instant, "13:00", BALI)).toBe(true);
  });
});

describe("isWeekend", () => {
  it("identifies Saturday and Sunday", () => {
    expect(isWeekend("2026-09-19", LAGOS)).toBe(true); // Saturday
    expect(isWeekend("2026-09-20", LAGOS)).toBe(true); // Sunday
    expect(isWeekend("2026-09-18", LAGOS)).toBe(false); // Friday
    expect(isWeekend("2026-09-21", LAGOS)).toBe(false); // Monday
  });
});

describe("addDays", () => {
  it("moves across month and year boundaries", () => {
    expect(addDays("2026-09-16", 1)).toBe("2026-09-17");
    expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("handles a leap day", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  });
});

describe("isValidTimezone", () => {
  it("accepts real zones and rejects junk, so Google cannot poison settings", () => {
    expect(isValidTimezone(LAGOS)).toBe(true);
    expect(isValidTimezone("Not/AZone")).toBe(false);
  });
});
