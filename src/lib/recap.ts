import { db } from "@/lib/db/client";
import { decrypt } from "@/lib/crypto";
import type { Day, DayEvent, Issue, Project, Settings, Workspace } from "@/lib/db/types";
import { createLinearClient, paginate, type Connection } from "@/lib/linear/client";
import {
  COMPLETED_SINCE,
  completedSinceFilter,
  PROJECT_UPDATE_CREATE,
  VIEWER,
} from "@/lib/linear/queries";
import { nowState } from "@/lib/day-state";
import { localInstant } from "@/lib/time";

/**
 * Assembling what the day actually amounted to.
 *
 * Kept separate from the Claude call and the email so the facts can be checked
 * on their own — a recap that quietly reports the wrong before/after figure is
 * worse than no recap.
 */

export type ClosedIssue = {
  identifier: string;
  title: string;
  url: string | null;
  ventureName: string;
  projectName: string | null;
  /** Linear's own project id, so the recap can post back against it. */
  linearProjectId: string | null;
  /** Which workspace's key can write to that project. */
  workspaceId: string;
};

export type ProjectMovement = {
  name: string;
  ventureName: string;
  targetDate: string | null;
  before: number;
  after: number;
};

export type RecapFacts = {
  date: string;
  needleMover: { identifier: string; title: string; ventureName: string } | null;
  needleMoverDone: boolean;
  blockReason: string | null;
  closed: ClosedIssue[];
  movements: ProjectMovement[];
  tomorrow: { identifier: string; title: string; ventureName: string } | null;
};

/** Everything TP closed today, across every venture, including outside the app. */
export async function closedToday(
  date: string,
  timezone: string,
  workspaces: Workspace[],
): Promise<ClosedIssue[]> {
  const since = localInstant(date, "00:00", timezone).toISOString();
  const out: ClosedIssue[] = [];

  for (const workspace of workspaces) {
    try {
      const client = createLinearClient(decrypt(workspace.api_key));
      const { viewer } = await client.request<{ viewer: { id: string } }>(VIEWER);

      const nodes = await paginate(
        client,
        COMPLETED_SINCE,
        { filter: completedSinceFilter(viewer.id, since, workspace.linear_team_id) },
        (data: {
          issues: Connection<{
            identifier: string;
            title: string;
            url: string | null;
            project: { id: string; name: string } | null;
          }>;
        }) => data.issues,
      );

      out.push(
        ...nodes.map((n) => ({
          identifier: n.identifier,
          title: n.title,
          url: n.url,
          ventureName: workspace.venture_name,
          projectName: n.project?.name ?? null,
          linearProjectId: n.project?.id ?? null,
          workspaceId: workspace.id,
        })),
      );
    } catch {
      // One unreachable workspace should not cost the whole recap. Its
      // absence is visible as a venture missing from the list.
    }
  }

  return out;
}

/**
 * Before and after for every targeted project, from the snapshots taken at
 * open and close. A project with no opening snapshot is skipped rather than
 * reported as having moved from zero.
 */
export async function projectMovements(date: string): Promise<ProjectMovement[]> {
  const snapshots = ((
    await db().from("progress_snapshots").select("*").eq("date", date)
  ).data ?? []) as Array<{ project_id: string; moment: "open" | "close"; progress: number }>;

  const open = new Map(snapshots.filter((s) => s.moment === "open").map((s) => [s.project_id, s.progress]));
  const close = new Map(snapshots.filter((s) => s.moment === "close").map((s) => [s.project_id, s.progress]));

  if (open.size === 0) return [];

  const projects = ((await db().from("projects").select("*")).data ?? []) as Project[];
  const workspaces = ((await db().from("workspaces").select("*")).data ?? []) as Workspace[];
  const ventureById = new Map(workspaces.map((w) => [w.id, w.venture_name]));

  return projects
    .filter((p) => open.has(p.id) && close.has(p.id))
    .map((p) => ({
      name: p.name,
      ventureName: ventureById.get(p.workspace_id) ?? "Unknown",
      targetDate: p.target_date,
      before: open.get(p.id)!,
      after: close.get(p.id)!,
    }))
    // Only projects that actually moved are worth a line in the recap.
    .filter((m) => Math.abs(m.after - m.before) > 0.0001)
    .sort((a, b) => b.after - b.before - (a.after - a.before));
}

export async function gatherRecap(day: Day, settings: Settings): Promise<RecapFacts> {
  const workspaces = ((
    await db().from("workspaces").select("*").eq("active", true)
  ).data ?? []) as Workspace[];

  const events = ((
    await db().from("day_events").select("*").eq("day_id", day.id)
  ).data ?? []) as DayEvent[];
  const state = nowState(day, events);

  const ventureById = new Map(workspaces.map((w) => [w.id, w.venture_name]));

  const describe = async (id: string | null) => {
    if (!id) return null;
    const { data } = await db().from("issues").select("*").eq("id", id).maybeSingle();
    const issue = data as Issue | null;
    if (!issue) return null;
    return {
      identifier: issue.identifier,
      title: issue.title,
      ventureName: ventureById.get(issue.workspace_id) ?? "Unknown",
    };
  };

  const [needleMover, closed, movements] = await Promise.all([
    describe(day.needle_mover_id),
    closedToday(day.date, settings.timezone, workspaces),
    projectMovements(day.date),
  ]);

  return {
    date: day.date,
    needleMover,
    needleMoverDone: state.needleMoverDone,
    blockReason: state.blockReason,
    closed,
    movements,
    tomorrow: null, // filled in by closeDay, which re-scores after the close
  };
}

/** Human-readable summary used in the email and as Claude's input. */
export function renderFacts(facts: RecapFacts): string {
  const lines: string[] = [];

  if (facts.needleMover) {
    lines.push(
      `Needle mover: ${facts.needleMover.identifier} "${facts.needleMover.title}" (${facts.needleMover.ventureName}) — ${
        facts.needleMoverDone ? "finished" : "not finished"
      }${facts.blockReason ? `, blocked: ${facts.blockReason}` : ""}`,
    );
  } else {
    lines.push("No needle mover was picked today.");
  }

  if (facts.closed.length === 0) {
    lines.push("Nothing was closed in Linear today.");
  } else {
    const byVenture = new Map<string, ClosedIssue[]>();
    for (const issue of facts.closed) {
      byVenture.set(issue.ventureName, [...(byVenture.get(issue.ventureName) ?? []), issue]);
    }
    lines.push(`Closed today (${facts.closed.length}):`);
    for (const [venture, issues] of byVenture) {
      lines.push(`  ${venture}: ${issues.map((i) => `${i.identifier} ${i.title}`).join("; ")}`);
    }
  }

  if (facts.movements.length > 0) {
    lines.push("Project targets that moved:");
    for (const m of facts.movements) {
      lines.push(
        `  ${m.name} (${m.ventureName}${m.targetDate ? `, target ${m.targetDate}` : ""}): ${Math.round(
          m.before * 100,
        )}% → ${Math.round(m.after * 100)}%`,
      );
    }
  } else {
    lines.push("No project target moved today.");
  }

  return lines.join("\n");
}


/**
 * Posts the day's outcome back to Linear, one update per project that had work
 * closed in it.
 *
 * This is what stops the recap dying in an inbox. Collaborators already live in
 * Linear, so a project update reaches them where they are, without an
 * unauthenticated page holding private titles.
 *
 * Failures are collected rather than thrown: the day is already closed, and one
 * unreachable workspace should not cost the other updates.
 */
export async function postProjectUpdates(
  facts: RecapFacts,
  summary: string,
): Promise<{ posted: number; failed: Array<{ project: string; error: string }> }> {
  const byProject = new Map<string, { name: string; workspaceId: string; issues: ClosedIssue[] }>();

  for (const issue of facts.closed) {
    if (!issue.linearProjectId) continue; // nothing to post against
    const existing = byProject.get(issue.linearProjectId);
    if (existing) existing.issues.push(issue);
    else
      byProject.set(issue.linearProjectId, {
        name: issue.projectName ?? "Project",
        workspaceId: issue.workspaceId,
        issues: [issue],
      });
  }

  if (byProject.size === 0) return { posted: 0, failed: [] };

  const workspaces = ((await db().from("workspaces").select("*")).data ?? []) as Workspace[];
  const keyFor = new Map(workspaces.map((w) => [w.id, w.api_key]));

  let posted = 0;
  const failed: Array<{ project: string; error: string }> = [];

  for (const [projectId, group] of byProject) {
    const key = keyFor.get(group.workspaceId);
    if (!key) continue;

    const closedHere = group.issues.map((i) => `- ${i.identifier} ${i.title}`).join("\n");
    const wasNeedleMover =
      facts.needleMover && group.issues.some((i) => i.identifier === facts.needleMover?.identifier);

    const body = [
      `**${facts.date}**`,
      "",
      summary,
      "",
      `Closed today:`,
      closedHere,
      wasNeedleMover ? "\nThis project held the day's needle mover." : "",
    ]
      .filter(Boolean)
      .join("\n");

    try {
      const result = await createLinearClient(decrypt(key)).request<{
        projectUpdateCreate: { success: boolean };
      }>(PROJECT_UPDATE_CREATE, { projectId, body });

      if (result.projectUpdateCreate.success) posted++;
      else failed.push({ project: group.name, error: "Linear rejected the update" });
    } catch (err) {
      failed.push({
        project: group.name,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { posted, failed };
}
