/**
 * Which Linear team a new issue is filed in.
 *
 * Linear requires a team on every issue, and a venture is a team — except a
 * venture left unscoped, which spans a whole organisation. There the project
 * decides, and failing that the organisation's only team. Anything else would
 * be a guess about where someone's work belongs, so it is refused with a note
 * that says how to fix it.
 */
export function resolveTeam(input: {
  workspaceTeamId: string | null;
  projectTeamIds: string[];
  orgTeamIds: string[];
}): { teamId: string } | { error: string } {
  if (input.workspaceTeamId) return { teamId: input.workspaceTeamId };
  if (input.projectTeamIds.length > 0) return { teamId: input.projectTeamIds[0] };
  if (input.orgTeamIds.length === 1) return { teamId: input.orgTeamIds[0] };
  return {
    error:
      "This venture spans a whole Linear organisation with several teams, so there is no team to file the issue in. Choose a project, or scope the venture to one team in Settings.",
  };
}
