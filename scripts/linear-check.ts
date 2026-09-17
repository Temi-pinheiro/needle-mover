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
import { ACTIVE_PROJECTS, OPEN_ISSUES, PROJECT_SCOPE, VIEWER } from "../src/lib/linear/queries";
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
        }>(OPEN_ISSUES, { assigneeId: viewer.viewer.id, after: null }),
      )
    : null;

  const projects = await step("active projects with targets", () =>
    client.request<{
      projects: { nodes: LinearProjectNode[]; pageInfo: { hasNextPage: boolean } };
    }>(ACTIVE_PROJECTS, { after: null }),
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
    largestFreeBlockHours: null,
    carryOver: {},
  });

  if (result.ranked.length === 0) {
    console.log("\nNothing rankable — every candidate is blocked or the backlog is empty.\n");
    return;
  }

  console.log("\nHow today would rank (no calendar, no carry-over)");
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
    console.log(
      `\n  The scoring cannot separate these. Claude would be picking from a\n  shortlist that is effectively unordered, which is a coin toss rather\n  than a ranking. Target dates on your active projects are the fix that\n  buys the most: they switch goal leverage back on and give deadline\n  pressure something to measure.`,
    );
  } else {
    console.log(`\n  The scoring separates these cleanly enough for the pick to mean something.`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
