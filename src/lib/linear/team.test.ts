import { describe, expect, it } from "vitest";
import { resolveTeam } from "./team";

describe("resolveTeam", () => {
  it("uses the venture's own team first", () => {
    expect(resolveTeam({ workspaceTeamId: "t1", projectTeamIds: ["t2"], orgTeamIds: ["t3"] })).toEqual({ teamId: "t1" });
  });

  it("falls back to the project's team for a whole-org venture", () => {
    expect(resolveTeam({ workspaceTeamId: null, projectTeamIds: ["t2", "t4"], orgTeamIds: [] })).toEqual({ teamId: "t2" });
  });

  it("uses the organisation's only team when there is no project", () => {
    expect(resolveTeam({ workspaceTeamId: null, projectTeamIds: [], orgTeamIds: ["t3"] })).toEqual({ teamId: "t3" });
  });

  it("refuses to guess between several teams", () => {
    const r = resolveTeam({ workspaceTeamId: null, projectTeamIds: [], orgTeamIds: ["t3", "t5"] });
    expect("error" in r).toBe(true);
  });
});
