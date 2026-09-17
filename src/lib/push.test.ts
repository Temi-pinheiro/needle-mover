import { describe, expect, it } from "vitest";
import { middayTime } from "./push";

describe("middayTime", () => {
  it("is the midpoint between the brief and the cutoff", () => {
    expect(middayTime("07:00", "19:00")).toBe("13:00");
    expect(middayTime("09:00", "17:00")).toBe("13:00");
  });

  it("follows an unusual working day rather than assuming noon", () => {
    // Someone who starts at 05:00 and stops at 15:00 has a 10:00 midday.
    expect(middayTime("05:00", "15:00")).toBe("10:00");
    expect(middayTime("11:00", "23:00")).toBe("17:00");
  });

  it("copes with Postgres time values that carry seconds", () => {
    expect(middayTime("07:00:00", "19:00:00")).toBe("13:00");
  });

  it("rounds to a whole minute", () => {
    expect(middayTime("07:00", "18:01")).toBe("12:31");
  });

  it("falls back when the cutoff is not after the brief", () => {
    expect(middayTime("19:00", "07:00")).toBe("13:00");
    expect(middayTime("12:00", "12:00")).toBe("13:00");
  });
});
