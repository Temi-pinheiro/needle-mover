import { describe, expect, it } from "vitest";
import { buildKeyterms, KEYTERM_WORD_BUDGET } from "./deepgram";
import type { CaptureVenture } from "./resolve";

const ventures: CaptureVenture[] = [
  { id: "a", name: "Northbound", projects: [{ id: "p1", name: "Public launch", targetDate: null }] },
  { id: "b", name: "Halyard", projects: [{ id: "p2", name: "public launch", targetDate: null }] },
];

describe("buildKeyterms", () => {
  it("puts hand-listed names first, then ventures, then projects", () => {
    expect(buildKeyterms(ventures, "Dayo, Adaeze Okafor")).toEqual([
      "Dayo",
      "Adaeze Okafor",
      "Northbound",
      "Halyard",
      "Public launch",
    ]);
  });

  it("dedupes case-insensitively and ignores empty entries", () => {
    expect(buildKeyterms(ventures, " , northbound,,")).toEqual(["northbound", "Halyard", "Public launch"]);
  });

  it("stops at the word budget without splitting a name", () => {
    const many = Array.from({ length: 200 }, (_, i) => `Client ${i}`).join(",");
    const terms = buildKeyterms(ventures, many);
    const words = terms.reduce((n, t) => n + t.split(" ").length, 0);
    expect(words).toBeLessThanOrEqual(KEYTERM_WORD_BUDGET);
    expect(terms.every((t) => /^Client \d+$/.test(t))).toBe(true);
  });

  it("works with nothing listed by hand", () => {
    expect(buildKeyterms([], undefined)).toEqual([]);
  });
});
