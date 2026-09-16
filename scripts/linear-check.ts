/**
 * Verifies the Linear queries against a real workspace.
 *
 * Every GraphQL field in src/lib/linear/queries.ts that isn't nailed down by
 * Linear's public docs gets confirmed here in one run, with Linear's own error
 * message if a field is wrong.
 *
 *   LINEAR_API_KEY=lin_api_... pnpm linear:check
 */
import { createLinearClient, LinearError } from '../src/lib/linear/client';
import {
  ACTIVE_PROJECTS,
  OPEN_ISSUES,
  PROJECT_SCOPE,
  VIEWER,
} from '../src/lib/linear/queries';
import { deriveRelations, sumScope } from '../src/lib/linear/map';

const key = process.env.LINEAR_API_KEY;
if (!key) {
  console.error(
    'Set LINEAR_API_KEY first. Linear → Settings → Security & access → Personal API keys.',
  );
  process.exit(1);
}

const client = createLinearClient(key);
let failures = 0;

async function step<T>(
  label: string,
  run: () => Promise<T>,
): Promise<T | null> {
  try {
    const result = await run();
    console.log(`  ok   ${label}`);
    return result;
  } catch (err) {
    failures++;
    const detail = err instanceof LinearError ? err.message : String(err);
    console.log(`  FAIL ${label}\n       ${detail}`);
    return null;
  }
}

async function main() {
  console.log('\nLinear schema check\n');

  const viewer = await step('viewer + organization', () =>
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
    ? await step('open issues assigned to you, with relations', () =>
        client.request<{
          issues: {
            nodes: Parameters<typeof deriveRelations>[0][];
            pageInfo: { hasNextPage: boolean };
          };
        }>(OPEN_ISSUES, { assigneeId: viewer.viewer.id, after: null }),
      )
    : null;

  const projects = await step('active projects with targets', () =>
    client.request<{
      projects: {
        nodes: Array<{
          id: string;
          name: string;
          targetDate: string | null;
          progress: number | null;
        }>;
        pageInfo: { hasNextPage: boolean };
      };
    }>(ACTIVE_PROJECTS, { after: null }),
  );

  if (projects?.projects.nodes.length) {
    const first = projects.projects.nodes[0];
    await step(`project scope for "${first.name}"`, async () => {
      const data = await client.request<{
        project: {
          issues: {
            nodes: Array<{ estimate: number | null; state: { type: string } }>;
          };
        };
      }>(PROJECT_SCOPE, { projectId: first.id, after: null });
      console.log(
        `       scope estimate: ${sumScope(data.project.issues.nodes) ?? 'none (falls back to neutral)'}`,
      );
      return data;
    });
  }

  // The numbers that decide whether the ranking will work at all.
  if (issues && projects) {
    const nodes = issues.issues.nodes;
    const targeted = new Set(
      projects.projects.nodes.filter((p) => p.targetDate).map((p) => p.id),
    );
    const withTarget = nodes.filter(
      (n) =>
        (n as { project?: { id: string } | null }).project?.id &&
        targeted.has((n as { project: { id: string } }).project.id),
    ).length;
    const blocked = nodes.filter((n) => deriveRelations(n).isBlocked).length;

    console.log('\nRanking readiness');
    console.log(
      `  open issues assigned to you   ${nodes.length}${issues.issues.pageInfo.hasNextPage ? '+ (more pages)' : ''}`,
    );
    console.log(`  blocked, so excluded          ${blocked}`);
    console.log(
      `  active projects               ${projects.projects.nodes.length}`,
    );
    console.log(`  …of which have a target date  ${targeted.size}`);
    console.log(`  candidates in a targeted project ${withTarget}`);
    if (withTarget < 8) {
      console.log(
        `\n  Note: under 8 candidates sit in a targeted project, so goal leverage\n  will be renormalised away and briefs will be marked degraded. Adding\n  target dates to your active projects is the single highest-leverage fix.`,
      );
    }
  }

  console.log(
    failures === 0
      ? '\nAll queries valid.\n'
      : `\n${failures} query/queries need fixing.\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
