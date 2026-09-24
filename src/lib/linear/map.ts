/**
 * Pure mapping from Linear's GraphQL shapes to the rows we cache.
 *
 * Kept separate from the network client so the relation logic — the part most
 * likely to be subtly wrong — is testable without a Linear key.
 */

const CLOSED_STATE_TYPES = new Set(["completed", "canceled"]);

export type LinearIssueNode = {
  id: string;
  identifier: string;
  title: string;
  url: string | null;
  priority: number | null;
  estimate: number | null;
  dueDate: string | null;
  updatedAt: string | null;
  state: { name: string; type: string };
  project: { id: string } | null;
  relations?: { nodes: Array<{ type: string; relatedIssue: { id: string; state: { type: string } } | null }> };
  inverseRelations?: { nodes: Array<{ type: string; issue: { id: string; state: { type: string } } | null }> };
};

export type LinearProjectNode = {
  id: string;
  name: string;
  state: string | null;
  targetDate: string | null;
  progress: number | null;
  priority?: number | null;
};

export const isOpen = (stateType: string) => !CLOSED_STATE_TYPES.has(stateType);

/**
 * `relations` holds relations where this issue is the source, so a `blocks`
 * relation there means *this issue blocks* the other one. `inverseRelations`
 * holds the mirror, so a `blocks` relation there means this issue *is blocked*.
 *
 * Only open issues on the other side count — being "blocked" by something
 * already shipped is not a blocker, and unblocking a cancelled issue is not
 * leverage.
 */
export function deriveRelations(node: LinearIssueNode): {
  blocksCount: number;
  isBlocked: boolean;
} {
  const blocksCount = (node.relations?.nodes ?? []).filter(
    (r) => r.type === "blocks" && r.relatedIssue && isOpen(r.relatedIssue.state.type),
  ).length;

  const isBlocked = (node.inverseRelations?.nodes ?? []).some(
    (r) => r.type === "blocks" && r.issue && isOpen(r.issue.state.type),
  );

  return { blocksCount, isBlocked };
}

export type IssueRow = {
  linear_issue_id: string;
  workspace_id: string;
  project_id: string | null;
  identifier: string;
  title: string;
  url: string | null;
  state: string;
  state_type: string;
  priority: number;
  estimate: number | null;
  due_date: string | null;
  blocks_count: number;
  is_blocked: boolean;
  linear_updated_at: string | null;
};

export function toIssueRow(
  node: LinearIssueNode,
  workspaceId: string,
  /** Linear project id -> our projects.id, for rows we've already upserted. */
  projectIds: Map<string, string>,
): IssueRow {
  const { blocksCount, isBlocked } = deriveRelations(node);
  return {
    linear_issue_id: node.id,
    workspace_id: workspaceId,
    project_id: node.project ? (projectIds.get(node.project.id) ?? null) : null,
    identifier: node.identifier,
    title: node.title,
    url: node.url,
    state: node.state.name,
    state_type: node.state.type,
    priority: node.priority ?? 0,
    estimate: node.estimate,
    due_date: node.dueDate,
    blocks_count: blocksCount,
    is_blocked: isBlocked,
    linear_updated_at: node.updatedAt,
  };
}

export type ProjectRow = {
  linear_project_id: string;
  workspace_id: string;
  name: string;
  target_date: string | null;
  progress: number;
  state: string | null;
  scope_estimate: number | null;
  priority: number | null;
};

export function toProjectRow(
  node: LinearProjectNode,
  workspaceId: string,
  scopeEstimate: number | null,
): ProjectRow {
  return {
    linear_project_id: node.id,
    workspace_id: workspaceId,
    name: node.name,
    target_date: node.targetDate ? node.targetDate.slice(0, 10) : null,
    progress: node.progress ?? 0,
    state: node.state,
    scope_estimate: scopeEstimate,
    priority: node.priority ?? null,
  };
}

/** Sum of estimates across a project's open issues. Null when nothing is estimated. */
export function sumScope(
  issues: Array<{ estimate: number | null; state: { type: string } }>,
): number | null {
  const estimated = issues.filter((i) => isOpen(i.state.type) && i.estimate != null);
  if (estimated.length === 0) return null;
  return estimated.reduce((sum, i) => sum + (i.estimate ?? 0), 0);
}
