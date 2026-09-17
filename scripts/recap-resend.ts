/**
 * Re-sends the recap for a day that was closed but whose email did not go out.
 *
 * closeDay deliberately closes the day even when the send fails — the record
 * matters more than the delivery — but that used to leave the recap stranded
 * with no way to retry it. This is that way.
 *
 *   pnpm recap:resend            today
 *   pnpm recap:resend 2026-09-17
 */
import { db } from "../src/lib/db/client";
import type { Day, Issue, Settings, Workspace } from "../src/lib/db/types";
import { closedToday, projectMovements } from "../src/lib/recap";
import { sendRecap } from "../src/lib/email/send";
import { localDate } from "../src/lib/time";

async function main() {
  const settings = (await db().from("settings").select("*").maybeSingle()).data as Settings;
  const date = process.argv[2] ?? localDate(new Date(), settings.timezone);

  const day = (await db().from("days").select("*").eq("date", date).maybeSingle()).data as Day | null;
  if (!day) {
    console.error(`No day row for ${date}.`);
    process.exit(1);
  }
  if (day.status !== "closed") {
    console.error(`${date} is not closed yet. Close it from the app first.`);
    process.exit(1);
  }
  if (day.recap_sent_at) {
    console.log(`\n  Already sent at ${day.recap_sent_at}. Sending again anyway.\n`);
  }

  const workspaces = ((await db().from("workspaces").select("*").eq("active", true)).data ??
    []) as Workspace[];
  const ventureById = new Map(workspaces.map((w) => [w.id, w.venture_name]));

  const describe = async (id: string | null) => {
    if (!id) return null;
    const issue = (await db().from("issues").select("*").eq("id", id).maybeSingle()).data as Issue | null;
    return issue
      ? {
          identifier: issue.identifier,
          title: issue.title,
          ventureName: ventureById.get(issue.workspace_id) ?? "Unknown",
        }
      : null;
  };

  const [closed, movements, needleMover, tomorrow] = await Promise.all([
    closedToday(date, settings.timezone, workspaces),
    projectMovements(date),
    describe(day.needle_mover_id),
    describe(day.recap_tomorrow_id),
  ]);

  console.log(`\n  Sending the ${date} recap to ${settings.email}`);
  console.log(`  from ${process.env.BRIEF_FROM_EMAIL}\n`);

  try {
    await sendRecap(settings.email, {
      date,
      summary: day.recap_summary ?? "",
      needleMover,
      needleMoverDone: false,
      blockReason: null,
      closed,
      movements,
      tomorrow,
      tomorrowNote: day.recap_tomorrow_note ?? "",
      appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
    });

    await db().from("days").update({ recap_sent_at: new Date().toISOString() }).eq("id", day.id);
    console.log("  Sent.\n");
  } catch (err) {
    console.log("  FAILED. Resend said:\n");
    console.log(`    ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
