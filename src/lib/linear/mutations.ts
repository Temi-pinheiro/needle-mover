import { db, unwrap } from "@/lib/db/client";
import { decrypt } from "@/lib/crypto";
import type { Issue, Workspace } from "@/lib/db/types";
import { createLinearClient } from "./client";
import { ISSUE_TEAM_STATES, SET_ISSUE_STATE } from "./queries";
import { alreadyIn, pickState, type WorkflowState } from "./states";

/**
 * Moves an issue into the team's first state of the given type, and mirrors
 * the result into the local cache so the Now view is correct immediately
 * rather than after the next sync.
 */
export async function moveIssueTo(
  issueId: string,
  targetType: "started" | "completed",
): Promise<{ moved: boolean; note?: string }> {
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
    return { moved: false, note: `Already ${targetType} in Linear.` };
  }

  const target = pickState(data.issue.team.states.nodes, targetType);
  if (!target) {
    return { moved: false, note: `That team has no ${targetType} state.` };
  }

  const result = await client.request<{
    issueUpdate: { success: boolean; issue: { state: { name: string; type: string } } };
  }>(SET_ISSUE_STATE, { issueId: issue.linear_issue_id, stateId: target.id });

  if (!result.issueUpdate.success) return { moved: false, note: "Linear rejected the update." };

  await db()
    .from("issues")
    .update({
      state: result.issueUpdate.issue.state.name,
      state_type: result.issueUpdate.issue.state.type,
    })
    .eq("id", issueId);

  return { moved: true };
}
