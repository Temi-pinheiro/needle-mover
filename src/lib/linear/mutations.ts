import { db, unwrap } from "@/lib/db/client";
import { decrypt } from "@/lib/crypto";
import type { Issue, Project, Workspace } from "@/lib/db/types";
import { createLinearClient } from "./client";
import {
  CREATE_ISSUE,
  ISSUE_TEAM_STATES,
  PROJECT_TEAMS,
  SET_ISSUE_STATE,
  TEAMS,
  VIEWER,
} from "./queries";
import { alreadyIn, pickState, type WorkflowState } from "./states";
import { toIssueRow, type LinearIssueNode } from "./map";
import { resolveTeam } from "./team";

/**
 * Moves an issue into the team's first state of the given type, and mirrors
 * the result into the local cache so the Now view is correct immediately
 * rather than after the next sync.
 */
export async function moveIssueTo(
  issueId: string,
  targetType: "started" | "completed",
): Promise<{ moved: boolean; note?: string; level?: "info" | "warning" }> {
  const issue = unwrap(await db().from("issues").select("*").eq("id", issueId).single()) as Issue;
  const workspace = unwrap(
    await db().from("workspaces").select("*").eq("id", issue.workspace_id).single(),
  ) as Workspace;

  const client = createLinearClient(decrypt(workspace.api_key));

  const data = await client.request<{
    issue: {
      state: { id: string; type: string };
      team: { states: { nodes: WorkflowState[] } };
    };
  }>(ISSUE_TEAM_STATES, { issueId: issue.linear_issue_id });

  if (alreadyIn(data.issue.state.type, targetType)) {
    return { moved: false, note: `Already ${targetType} in Linear.`, level: "info" };
  }

  const target = pickState(data.issue.team.states.nodes, targetType);
  if (!target) {
    return { moved: false, note: `That team has no ${targetType} state.`, level: "warning" };
  }

  const result = await client.request<{
    issueUpdate: { success: boolean; issue: { state: { name: string; type: string } } };
  }>(SET_ISSUE_STATE, { issueId: issue.linear_issue_id, stateId: target.id });

  if (!result.issueUpdate.success) {
    return { moved: false, note: "Marked here, but Linear rejected the update.", level: "warning" };
  }

  await db()
    .from("issues")
    .update({
      state: result.issueUpdate.issue.state.name,
      state_type: result.issueUpdate.issue.state.type,
    })
    .eq("id", issueId);

  return { moved: true };
}

export type NewIssue = {
  workspaceId: string;
  projectId: string | null;
  title: string;
  description: string;
  dueDate: string | null;
};

/**
 * Files an approved capture in Linear, assigned to the key's owner — an
 * unassigned issue would never reach the ranking, which is the point of
 * capturing it. The result goes straight into the cache so it can be picked
 * without waiting for a sync.
 */
export async function createIssue(
  input: NewIssue,
): Promise<{ ok: true; issue: { id: string; identifier: string; url: string | null } } | { ok: false; note: string }> {
  const workspace = unwrap(
    await db().from("workspaces").select("*").eq("id", input.workspaceId).single(),
  ) as Workspace;
  const project = input.projectId
    ? (unwrap(await db().from("projects").select("*").eq("id", input.projectId).single()) as Project)
    : null;

  if (project && project.workspace_id !== workspace.id) {
    return { ok: false, note: "That project belongs to a different venture." };
  }

  const client = createLinearClient(decrypt(workspace.api_key));
  const { viewer } = await client.request<{ viewer: { id: string } }>(VIEWER);

  // Only look further when the venture itself does not name a team.
  let projectTeamIds: string[] = [];
  let orgTeamIds: string[] = [];
  if (!workspace.linear_team_id) {
    if (project) {
      const data = await client.request<{ project: { teams: { nodes: Array<{ id: string }> } } }>(
        PROJECT_TEAMS,
        { projectId: project.linear_project_id },
      );
      projectTeamIds = data.project.teams.nodes.map((t) => t.id);
    } else {
      const data = await client.request<{ teams: { nodes: Array<{ id: string }> } }>(TEAMS);
      orgTeamIds = data.teams.nodes.map((t) => t.id);
    }
  }

  const team = resolveTeam({ workspaceTeamId: workspace.linear_team_id, projectTeamIds, orgTeamIds });
  if ("error" in team) return { ok: false, note: team.error };

  const result = await client.request<{
    issueCreate: { success: boolean; issue: LinearIssueNode | null };
  }>(CREATE_ISSUE, {
    input: {
      teamId: team.teamId,
      title: input.title,
      description: input.description || undefined,
      assigneeId: viewer.id,
      ...(project ? { projectId: project.linear_project_id } : {}),
      ...(input.dueDate ? { dueDate: input.dueDate } : {}),
    },
  });

  const created = result.issueCreate.issue;
  if (!result.issueCreate.success || !created) return { ok: false, note: "Linear rejected the new issue." };

  const projectIds = new Map(project ? [[project.linear_project_id, project.id]] : []);
  await db()
    .from("issues")
    .upsert(
      { ...toIssueRow(created, workspace.id, projectIds), synced_at: new Date().toISOString() },
      { onConflict: "linear_issue_id" },
    );

  return { ok: true, issue: { id: created.id, identifier: created.identifier, url: created.url } };
}
