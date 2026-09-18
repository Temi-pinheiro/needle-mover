/**
 * Verifies the Linear integration against a real workspace, then dry-runs the
 * ranking over the real backlog.
 *
 * The second half matters more than the first. Confirming the GraphQL fields
 * exist says nothing about whether the scoring can actually separate a real
 * set of issues — and a shortlist that is effectively unordered makes Claude's
 * pick a coin toss. This shows that before five mornings of briefs, not after.
 *
 * Runs entirely from LINEAR_API_KEY: no database, no calendar, no workspace row.
 *
 *   pnpm linear:check
 */
import { createLinearClient, LinearError } from "../src/lib/linear/client";
import {
  ACTIVE_PROJECTS,
  activeProjectsFilter,
  COMPLETED_SINCE,
  completedSinceFilter,
  openIssuesFilter,
  OPEN_ISSUES,
  PROJECT_SCOPE,
  TEAM_ESTIMATION,
  VIEWER,
} from "../src/lib/linear/queries";
import {
  deriveRelations,
  sumScope,
  type LinearIssueNode,
  type LinearProjectNode,
} from "../src/lib/linear/map";
import { scoreAll } from "../src/lib/scoring/score";
import type { Candidate } from "../src/lib/scoring/types";
import { targetedThreshold } from "../src/lib/scoring/weights";

const key = process.env.LINEAR_API_KEY;
if (!key) {
  console.error("Set LINEAR_API_KEY first. Linear → Settings → Security & access → Personal API keys.");
  process.exit(1);
}

const client = createLinearClient(key);
let failures = 0;

async function step<T>(label: string, run: () => Promise<T>): Promise<T | null> {
  try {
    const result = await run();
    console.log(`  ok   ${label}`);
    return result;
  } catch (err) {
    failures++;
    console.log(`  FAIL ${label}\n       ${err instanceof LinearError ? err.message : String(err)}`);
    return null;
  }
}

type ScopeIssue = { estimate: number | null; state: { type: string } };

async function main() {
  console.log("\nLinear schema check\n");

  const viewer = await step("viewer + organization", () =>
    client.request<{
      viewer: { id: string; name: string; email: string };
      organization: { id: string; name: string; urlKey: string };
    }>(VIEWER),
  );

  if (viewer) {
    console.log(
      `       ${viewer.organization.name} (${viewer.organization.urlKey}) as ${viewer.viewer.name}`,
    );
  }

  const issues = viewer
    ? await step("open issues assigned to you, with relations", () =>
        client.request<{
          issues: { nodes: LinearIssueNode[]; pageInfo: { hasNextPage: boolean } };
        }>(OPEN_ISSUES, { filter: openIssuesFilter(viewer.viewer.id), after: null }),
      )
    : null;

  const projects = await step("active projects with targets", () =>
    client.request<{
      projects: { nodes: LinearProjectNode[]; pageInfo: { hasNextPage: boolean } };
    }>(ACTIVE_PROJECTS, { filter: activeProjectsFilter(), after: null }),
  );

  if (projects?.projects.nodes.length) {
    const first = projects.projects.nodes[0];
    await step(`project scope for "${first.name}"`, async () => {
      const data = await client.request<{
        project: { issues: { nodes: ScopeIssue[] } };
      }>(PROJECT_SCOPE, { projectId: first.id, after: null });
      console.log(
        `       scope estimate: ${sumScope(data.project.issues.nodes) ?? "none (falls back to neutral)"}`,
      );
      return data;
    });
  }

  if (viewer) {
    const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const closed = await step("issues completed in the last 7 days (recap source)", () =>
      client.request<{ issues: { nodes: Array<{ identifier: string; completedAt: string }> } }>(
        COMPLETED_SINCE,
        { filter: completedSinceFilter(viewer.viewer.id, since), after: null },
      ),
    );
    if (closed) console.log(`       ${closed.issues.nodes.length} closed in the last week`);
  }

  const teams = await step("team estimation settings", () =>
    client.request<{
      teams: {
        nodes: Array<{ key: string; name: string; issueEstimationType: string }>;
      };
    }>(TEAM_ESTIMATION),
  );

  if (teams) {
    for (const t of teams.teams.nodes) {
      const scale = t.issueEstimationType;
      console.log(
        `       ${t.key.padEnd(6)} ${t.name.padEnd(24)} ${scale === "notUsed" ? "estimates OFF" : scale}`,
      );
    }
  }

  if (issues && projects && viewer) {
    report(issues.issues.nodes, projects.projects.nodes, viewer.organization.name, issues.issues.pageInfo.hasNextPage);
  }

  console.log(failures === 0 ? "\nAll queries valid.\n" : `\n${failures} query/queries need fixing.\n`);
  process.exit(failures === 0 ? 0 : 1);
}

function report(
  nodes: LinearIssueNode[],
  projectNodes: LinearProjectNode[],
  venture: string,
  morePages: boolean,
) {
  const byId = new Map(projectNodes.map((p) => [p.id, p]));
  const targeted = new Set(projectNodes.filter((p) => p.targetDate).map((p) => p.id));
  const inTargeted = nodes.filter((n) => n.project && targeted.has(n.project.id)).length;
  const blocked = nodes.filter((n) => deriveRelations(n).isBlocked).length;

  console.log("\nRanking readiness");
  console.log(`  open issues assigned to you      ${nodes.length}${morePages ? "+ (more pages)" : ""}`);
  console.log(`  blocked, so excluded             ${blocked}`);
  console.log(`  active projects                  ${projectNodes.length}`);
  console.log(`  …of which have a target date     ${targeted.size}`);
  console.log(`  candidates in a targeted project ${inTargeted}`);

  // Whether any factor has something to work with at all.
  console.log("\nSignal coverage");
  console.log(`  have a due date                  ${nodes.filter((n) => n.dueDate).length}/${nodes.length}`);
  console.log(`  have an estimate                 ${nodes.filter((n) => n.estimate != null).length}/${nodes.length}`);
  console.log(`  have a priority set              ${nodes.filter((n) => (n.priority ?? 0) > 0).length}/${nodes.length}`);
  console.log(`  already in progress              ${nodes.filter((n) => n.state.type === "started").length}/${nodes.length}`);

  const candidates: Candidate[] = nodes.map((n) => {
    const project = n.project ? byId.get(n.project.id) : null;
    const { blocksCount, isBlocked } = deriveRelations(n);
    return {
      issue: {
        id: n.id,
        identifier: n.identifier,
        title: n.title,
        workspaceId: "check",
        ventureName: venture,
        priority: n.priority ?? 0,
        estimate: n.estimate,
        dueDate: n.dueDate,
        stateType: n.state.type,
        blocksCount,
        isBlocked,
      },
      project: project
        ? {
            id: project.id,
            name: project.name,
            targetDate: project.targetDate ? project.targetDate.slice(0, 10) : null,
            progress: project.progress ?? 0,
            scopeEstimate: null,
          }
        : null,
    };
  });

  const result = scoreAll(candidates, {
    today: new Date().toISOString().slice(0, 10),
    carryOver: {},
  });

  if (result.ranked.length === 0) {
    console.log("\nNothing rankable — every candidate is blocked or the backlog is empty.\n");
    return;
  }

  console.log("\nHow today would rank (no carry-over)");
  for (const [i, r] of result.ranked.entries()) {
    const factors = Object.entries(r.contributions)
      .filter(([, v]) => v > 0.001)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k} ${v.toFixed(2)}`)
      .join(", ");
    console.log(
      `  ${String(i + 1).padStart(2)}. ${r.total.toFixed(3)}  ${r.candidate.issue.identifier.padEnd(9)} ${r.candidate.issue.title.slice(0, 52)}`,
    );
    console.log(`      ${factors || "no factor scored above zero"}`);
  }

  const scores = result.ranked.map((r) => r.total);
  const spread = scores.length > 1 ? scores[0] - scores[scores.length - 1] : 0;
  const tiedAtTop = scores.filter((s) => Math.abs(s - scores[0]) < 0.001).length;

  console.log(`\n  spread, first to last            ${spread.toFixed(3)}`);
  console.log(`  tied for first                   ${tiedAtTop}`);

  if (result.degraded) {
    console.log(
      `\n  Goal leverage needs ${targetedThreshold(result.ranked.length)} of these ${result.ranked.length} in a targeted project and has\n  ${result.targetedCount}, so it was renormalised away and every brief is marked degraded.`,
    );
  }

  if (tiedAtTop > 1 || spread < 0.05) {
    // Name the signal that is actually missing rather than always blaming
    // target dates — once those are in, the next tie is a different problem.
    const withEstimate = nodes.filter((n) => n.estimate != null).length;
    const withDue = nodes.filter((n) => n.dueDate).length;
    const unblocking = nodes.filter((n) => deriveRelations(n).blocksCount > 0).length;

    console.log(`\n  ${tiedAtTop} candidates are tied at the top.`);

    if (inTargeted < nodes.length / 2) {
      console.log(
        `\n  Target dates are the fix that buys the most: only ${inTargeted} of ${nodes.length}\n  candidates sit in a targeted project, so goal leverage is switched off.`,
      );
    } else if (withEstimate < nodes.length / 2) {
      console.log(
        `\n  Estimates are the fix that buys the most. Only ${withEstimate} of ${nodes.length} have one,\n  so scope share falls back to neutral for the rest — and two issues in the\n  same project with the same priority then score *identically* on goal\n  leverage. An estimate is what separates them.`,
      );
    } else if (withDue === 0 && unblocking === 0) {
      console.log(
        `\n  Nothing carries an issue-level due date or a blocks relation, so deadline\n  pressure is uniform within a project and unblocking contributes nothing.\n  Either signal would break the remaining ties.`,
      );
    } else {
      console.log(
        `\n  The remaining ties are between genuinely comparable issues. Claude breaks\n  them on judgement the score cannot see, which is the design working.`,
      );
    }
  } else {
    console.log(`\n  The scoring separates these cleanly enough for the pick to mean something.`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
