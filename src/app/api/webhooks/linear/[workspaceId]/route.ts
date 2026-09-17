import { db } from "@/lib/db/client";
import type { Workspace } from "@/lib/db/types";
import { verifyDelivery } from "@/lib/linear/webhook";
import { deriveRelations, isOpen, type LinearIssueNode } from "@/lib/linear/map";

export const dynamic = "force-dynamic";

/**
 * Keeps one issue fresh between ticks.
 *
 * The 15-minute sync is the backstop; this is what makes the Now view correct
 * within seconds of a state change in Linear. It updates a single row rather
 * than triggering a full sync — a webhook storm should not become a sync storm.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await params;

  const { data } = await db()
    .from("workspaces")
    .select("*")
    .eq("id", workspaceId)
    .maybeSingle();
  const workspace = data as Workspace | null;

  // Same response whether the workspace is unknown or unconfigured, so this
  // endpoint cannot be used to enumerate workspace ids.
  if (!workspace?.webhook_secret) {
    return Response.json({ error: "unknown" }, { status: 404 });
  }

  // Read the body as text: verification must run over the exact bytes sent.
  const raw = await request.text();
  const result = verifyDelivery(raw, workspace.webhook_secret, request.headers.get("linear-signature"));

  if (!result.ok) {
    return Response.json({ error: result.reason }, { status: 401 });
  }

  const { action, type, data: node } = result.payload;
  if (type !== "Issue" || !node) {
    // Acknowledged and ignored. A non-2xx would make Linear retry something
    // we are never going to act on.
    return Response.json({ ok: true, ignored: type ?? "unknown" });
  }

  const issue = node as unknown as LinearIssueNode & { id: string };

  if (action === "remove") {
    await db().from("issues").delete().eq("linear_issue_id", issue.id);
    return Response.json({ ok: true, removed: true });
  }

  const stateType = issue.state?.type;
  if (stateType && !isOpen(stateType)) {
    // It has left the open set, which is exactly what sync would have swept.
    await db().from("issues").delete().eq("linear_issue_id", issue.id);
    return Response.json({ ok: true, closed: true });
  }

  // Only update what we already cache. Creating a row here would need the
  // project mapping and the assignee check that sync does properly, and a
  // half-populated row is worse than waiting fifteen minutes for a whole one.
  const existing = await db()
    .from("issues")
    .select("id")
    .eq("linear_issue_id", issue.id)
    .maybeSingle();

  if (!existing.data) {
    return Response.json({ ok: true, deferred: "not cached; the next sync will pick it up" });
  }

  const { blocksCount, isBlocked } = deriveRelations(issue);

  await db()
    .from("issues")
    .update({
      title: issue.title,
      state: issue.state?.name,
      state_type: stateType,
      priority: issue.priority ?? 0,
      estimate: issue.estimate,
      due_date: issue.dueDate,
      blocks_count: blocksCount,
      is_blocked: isBlocked,
      linear_updated_at: issue.updatedAt,
    })
    .eq("linear_issue_id", issue.id);

  return Response.json({ ok: true, updated: issue.identifier ?? issue.id });
}
