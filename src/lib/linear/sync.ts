import { db, unwrap } from "@/lib/db/client";
import { decrypt } from "@/lib/crypto";
import type { Workspace } from "@/lib/db/types";
import { createLinearClient, paginate, type Connection, type LinearClient } from "./client";
import {
  ACTIVE_PROJECTS,
  activeProjectsFilter,
  openIssuesFilter,
  OPEN_ISSUES,
  PROJECT_SCOPE,
  VIEWER,
} from "./queries";
import { sumScope, toIssueRow, toProjectRow, type LinearIssueNode, type LinearProjectNode } from "./map";

/**
 * Pulls one workspace into the local cache.
 *
 * Projects sync before issues so an issue can resolve its project to our own
 * id. Rows that Linear no longer returns are swept by comparing `synced_at`
 * against this run's stamp — mark-and-sweep, rather than sending every
 * surviving id back as a filter.
 */

export type SyncResult = {
  workspaceId: string;
  ventureName: string;
  projects: number;
  issues: number;
  targetedProjects: number;
  error?: string;
};

type ScopeIssue = { estimate: number | null; state: { type: string } };

export async function syncWorkspace(workspace: Workspace): Promise<SyncResult> {
  const result: SyncResult = {
    workspaceId: workspace.id,
    ventureName: workspace.venture_name,
    projects: 0,
    issues: 0,
    targetedProjects: 0,
  };

  try {
    const client = createLinearClient(decrypt(workspace.api_key));
    const stamp = new Date().toISOString();

    const { viewer, organization } = await client.request<{
      viewer: { id: string };
      organization: { id: string };
    }>(VIEWER);

    const projectIds = await syncProjects(client, workspace, stamp, result);
    result.issues = await syncIssues(client, workspace, viewer.id, projectIds, stamp);

    await db()
      .from("workspaces")
      .update({ linear_org_id: organization.id, last_synced_at: stamp })
      .eq("id", workspace.id);

    return result;
  } catch (err) {
    // One broken workspace must not stop the others — a brief covering three
    // ventures out of four is still worth sending.
    return { ...result, error: err instanceof Error ? err.message : String(err) };
  }
}

async function syncProjects(
  client: LinearClient,
  workspace: Workspace,
  stamp: string,
  result: SyncResult,
): Promise<Map<string, string>> {
  const nodes = await paginate(
    client,
    ACTIVE_PROJECTS,
    { filter: activeProjectsFilter(workspace.linear_team_id) },
    (data: { projects: Connection<LinearProjectNode> }) => data.projects,
  );

  const rows = [];
  for (const node of nodes) {
    // Scope share only matters where there is a target to move toward, so the
    // extra query is skipped for untargeted projects.
    const scope = node.targetDate ? sumScope(await projectIssues(client, node.id)) : null;
    rows.push({ ...toProjectRow(node, workspace.id, scope), synced_at: stamp });
  }

  result.projects = rows.length;
  result.targetedProjects = rows.filter((r) => r.target_date).length;

  if (rows.length > 0) {
    unwrap(await db().from("projects").upsert(rows, { onConflict: "linear_project_id" }).select("id"));
  }

  await db().from("projects").delete().eq("workspace_id", workspace.id).lt("synced_at", stamp);

  const saved = unwrap(
    await db().from("projects").select("id, linear_project_id").eq("workspace_id", workspace.id),
  ) as Array<{ id: string; linear_project_id: string }>;

  return new Map(saved.map((p) => [p.linear_project_id, p.id]));
}

function projectIssues(client: LinearClient, projectId: string): Promise<ScopeIssue[]> {
  return paginate(
    client,
    PROJECT_SCOPE,
    { projectId },
    (data: { project: { issues: Connection<ScopeIssue> } }) => data.project.issues,
  );
}

async function syncIssues(
  client: LinearClient,
  workspace: Workspace,
  assigneeId: string,
  projectIds: Map<string, string>,
  stamp: string,
): Promise<number> {
  const nodes = await paginate(
    client,
    OPEN_ISSUES,
    { filter: openIssuesFilter(assigneeId, workspace.linear_team_id) },
    (data: { issues: Connection<LinearIssueNode> }) => data.issues,
  );

  const rows = nodes.map((n) => ({ ...toIssueRow(n, workspace.id, projectIds), synced_at: stamp }));

  if (rows.length > 0) {
    unwrap(await db().from("issues").upsert(rows, { onConflict: "linear_issue_id" }).select("id"));
  }

  // Anything this workspace did not return has been closed, cancelled or
  // reassigned. Drop it, so scoring never has to reason about staleness.
  await db().from("issues").delete().eq("workspace_id", workspace.id).lt("synced_at", stamp);

  return rows.length;
}

/** Syncs every active workspace. Failures are reported per workspace, not thrown. */
export async function syncAll(): Promise<SyncResult[]> {
  const workspaces = unwrap(
    await db().from("workspaces").select("*").eq("active", true),
  ) as Workspace[];

  return Promise.all(workspaces.map(syncWorkspace));
}
