import { describe, expect, it } from "vitest";
import {
  blankProposal,
  fallbackTitle,
  issueDescription,
  resolveProposal,
  validDueDate,
  type CaptureVenture,
} from "./resolve";
import type { ParsedCapture } from "./schema";

const ventures: CaptureVenture[] = [
  {
    id: "ws-nbd",
    name: "Northbound",
    projects: [
      { id: "p-launch", name: "Public launch", targetDate: "2026-10-01" },
      { id: "p-shared", name: "Hiring", targetDate: null },
    ],
  },
  {
    id: "ws-hly",
    name: "Halyard",
    projects: [
      { id: "p-pilot", name: "Client pilot", targetDate: "2026-11-15" },
      { id: "p-shared-2", name: "Hiring", targetDate: null },
    ],
  },
];

const TODAY = "2026-09-22";

const parsed = (over: Partial<ParsedCapture> = {}): ParsedCapture => ({
  title: "Send Dayo the pricing deck",
  venture: "Northbound",
  project: "Public launch",
  due_date: null,
  description: null,
  ...over,
});

describe("resolveProposal", () => {
  it("maps names to ids", () => {
    expect(resolveProposal(parsed(), ventures, "raw", TODAY)).toEqual({
      title: "Send Dayo the pricing deck",
      workspace_id: "ws-nbd",
      project_id: "p-launch",
      due_date: null,
      description: null,
    });
  });

  it("matches names regardless of case and spacing", () => {
    const r = resolveProposal(parsed({ venture: " northbound ", project: "public  LAUNCH" }), ventures, "raw", TODAY);
    expect(r.workspace_id).toBe("ws-nbd");
    expect(r.project_id).toBe("p-launch");
  });

  it("drops an unknown venture rather than guessing", () => {
    const r = resolveProposal(parsed({ venture: "Meridian", project: null }), ventures, "raw", TODAY);
    expect(r.workspace_id).toBeNull();
  });

  it("drops a project that belongs to a different venture", () => {
    const r = resolveProposal(parsed({ venture: "Halyard", project: "Public launch" }), ventures, "raw", TODAY);
    expect(r.workspace_id).toBe("ws-hly");
    expect(r.project_id).toBeNull();
  });

  it("infers the venture from a project name that only one venture has", () => {
    const r = resolveProposal(parsed({ venture: null, project: "Client pilot" }), ventures, "raw", TODAY);
    expect(r.workspace_id).toBe("ws-hly");
    expect(r.project_id).toBe("p-pilot");
  });

  it("does not infer from a project name two ventures share", () => {
    const r = resolveProposal(parsed({ venture: null, project: "Hiring" }), ventures, "raw", TODAY);
    expect(r.workspace_id).toBeNull();
    expect(r.project_id).toBeNull();
  });

  it("defaults to the only venture when there is one", () => {
    const r = resolveProposal(parsed({ venture: null, project: null }), [ventures[0]], "raw", TODAY);
    expect(r.workspace_id).toBe("ws-nbd");
  });

  it("falls back to the first sentence when the title comes back empty", () => {
    const r = resolveProposal(parsed({ title: "  " }), ventures, "Call Dayo. He asked about Q4.", TODAY);
    expect(r.title).toBe("Call Dayo");
  });

  it("trims a trailing full stop and caps the length", () => {
    expect(resolveProposal(parsed({ title: "Book the venue." }), ventures, "raw", TODAY).title).toBe("Book the venue");
    expect(resolveProposal(parsed({ title: "x".repeat(300) }), ventures, "raw", TODAY).title).toHaveLength(120);
  });

  it("keeps a description only when it has content", () => {
    expect(resolveProposal(parsed({ description: "  " }), ventures, "raw", TODAY).description).toBeNull();
    expect(resolveProposal(parsed({ description: "v2 deck" }), ventures, "raw", TODAY).description).toBe("v2 deck");
  });
});

describe("validDueDate", () => {
  it("accepts today and later", () => {
    expect(validDueDate("2026-09-22", TODAY)).toBe("2026-09-22");
    expect(validDueDate("2026-09-25", TODAY)).toBe("2026-09-25");
  });

  it("drops a date already past, which is usually a misheard weekday", () => {
    expect(validDueDate("2026-09-18", TODAY)).toBeNull();
  });

  it("drops anything that is not a real calendar date", () => {
    expect(validDueDate("2026-02-30", TODAY)).toBeNull();
    expect(validDueDate("Friday", TODAY)).toBeNull();
    expect(validDueDate("2026-9-25", TODAY)).toBeNull();
    expect(validDueDate(null, TODAY)).toBeNull();
  });
});

describe("fallbackTitle", () => {
  it("takes the first sentence", () => {
    expect(fallbackTitle("Send the deck! Then book flights.")).toBe("Send the deck!");
  });
});

describe("blankProposal", () => {
  it("starts from the words and the only venture", () => {
    expect(blankProposal("Chase the invoice", [ventures[0]])).toEqual({
      title: "Chase the invoice",
      workspace_id: "ws-nbd",
      project_id: null,
      due_date: null,
      description: null,
    });
  });

  it("leaves the venture open when there are several", () => {
    expect(blankProposal(null, ventures).workspace_id).toBeNull();
  });
});

describe("issueDescription", () => {
  it("always carries the original words, quoted", () => {
    expect(issueDescription(null, "call dayo\nabout pricing")).toBe(
      "> call dayo\n> about pricing\n\n— captured in Needle Mover",
    );
  });

  it("puts the detail above the quote", () => {
    expect(issueDescription("Use the v2 deck", "send deck")).toBe(
      "Use the v2 deck\n\n> send deck\n\n— captured in Needle Mover",
    );
  });

  it("is empty when there is nothing to say", () => {
    expect(issueDescription(null, null)).toBe("");
  });
});
