/**
 * Runs the full morning path — sync, score, Claude pick — and renders the
 * brief to a file, without sending anything.
 *
 * This is the seam the unit tests cannot reach: scoring feeding a real Claude
 * call feeding a real email. Safe to run repeatedly; it never touches
 * brief_sent_at, so the scheduled brief still goes out on time.
 *
 *   pnpm brief:preview
 */
import { writeFileSync } from "node:fs";
import { render } from "@react-email/components";
import { db } from "../src/lib/db/client";
import { carryOverMap, getSettings, planDay } from "../src/lib/day";
import { needsSplitPrompt } from "../src/lib/scoring/score";
import { syncAll } from "../src/lib/linear/sync";
import { localTime } from "../src/lib/time";
import { BriefEmail } from "../src/emails/BriefEmail";
import type { Issue, Project, Workspace } from "../src/lib/db/types";

const out = process.argv[2] ?? "/tmp/needle-mover-brief.html";

async function main() {
  console.log("\nSyncing…");
  for (const r of await syncAll()) {
    console.log(
      r.error
        ? `  FAIL ${r.ventureName}: ${r.error}`
        : `  ok   ${r.ventureName}: ${r.issues} issues, ${r.targetedProjects}/${r.projects} projects targeted`,
    );
  }

  console.log("\nScoring and asking Claude…");
  const plan = await planDay(new Date());

  if (plan.status === "no-candidates") {
    console.log("\n  Nothing open and unblocked is assigned to you. No brief to build.\n");
    return;
  }

  const { day, repairs, degraded } = plan;
  const settings = await getSettings();

  const issue = (await db().from("issues").select("*").eq("id", day.needle_mover_id!).single())
    .data as Issue;
  const workspace = (await db().from("workspaces").select("*").eq("id", issue.workspace_id).single())
    .data as Workspace;
  const project = issue.project_id
    ? ((await db().from("projects").select("*").eq("id", issue.project_id).maybeSingle())
        .data as Project | null)
    : null;
  const backup = day.backup_id
    ? ((await db().from("issues").select("identifier, title").eq("id", day.backup_id).maybeSingle())
        .data as { identifier: string; title: string } | null)
    : null;

  const carryOverDays = (await carryOverMap(day.date))[issue.id] ?? 0;

  console.log(`\n  Needle mover  ${issue.identifier}  ${issue.title}`);
  console.log(`  Venture       ${workspace.venture_name}`);
  console.log(`  Project       ${project?.name ?? "none"}${project?.target_date ? ` (target ${project.target_date})` : ""}`);
  console.log(`  First step    ${day.first_step}`);
  console.log(`  Why           ${day.reason}`);
  console.log(`  Plain focus   ${day.plain_focus}`);
  console.log(`  Backup        ${backup ? `${backup.identifier}  ${backup.title}` : "none"}`);
  console.log(`  Also today    ${day.also_today_ids.length}`);
  if (repairs.length) console.log(`  Repaired      ${repairs.join("; ")}`);
  if (degraded) console.log(`  Degraded      goal leverage was renormalised away`);

  const html = await render(
    BriefEmail({
      date: day.date,
      ventureName: workspace.venture_name,
      identifier: issue.identifier,
      title: issue.title,
      issueUrl: issue.url,
      projectName: project?.name ?? null,
      projectTarget: project?.target_date ?? null,
      reason: day.reason ?? "",
      firstStep: day.first_step ?? "",
      focusWindow:
        day.focus_window_start && day.focus_window_end
          ? `${localTime(new Date(day.focus_window_start), settings.timezone)}–${localTime(new Date(day.focus_window_end), settings.timezone)}`
          : null,
      inboxCount: 0,
      carryOverDays,
      needsSplit: needsSplitPrompt(carryOverDays),
      degraded,
      appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
    }),
  );

  writeFileSync(out, html);
  console.log(`\n  Brief written to ${out}\n  Open it to see exactly what would land in your inbox.\n`);
}

main().catch((err) => {
  console.error(`\n${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
