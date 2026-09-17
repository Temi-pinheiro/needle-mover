/**
 * Which migrations have actually been applied.
 *
 * Migrations here are applied by hand in the Supabase SQL editor, so there is
 * no migrations table to consult. This probes for a column each one adds,
 * which is the only honest way to answer the question.
 *
 *   pnpm migrations
 */
import { createClient } from "@supabase/supabase-js";

/**
 * Most migrations add a column, so probing for it answers the question. 0005
 * does not: it backfills a column that 0001 already created, so it has to be
 * checked by whether any row is still missing a value. Probing the column
 * there would report "applied" for a migration that had never run.
 */
type Probe =
  | { file: string; what: string; kind: "column"; table: string; column: string }
  | { file: string; what: string; kind: "backfill"; table: string; column: string };

const PROBES: Probe[] = [
  { file: "0001_init", what: "core schema", kind: "column", table: "settings", column: "email" },
  { file: "0003_pause_briefs", what: "hold briefs until a date", kind: "column", table: "settings", column: "paused_until" },
  { file: "0004_recap_text", what: "recap shown in the app", kind: "column", table: "days", column: "recap_summary" },
  { file: "0005_webhook_secret", what: "per-venture webhook secrets", kind: "backfill", table: "workspaces", column: "webhook_secret" },
  { file: "0006_team_scoping", what: "venture scoped to a Linear team", kind: "column", table: "workspaces", column: "linear_team_id" },
];

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }

  const db = createClient(url, key, { auth: { persistSession: false } });
  console.log("\nMigrations\n");

  const pending: string[] = [];

  for (const probe of PROBES) {
    const { data, error } = await db.from(probe.table).select(probe.column);

    let applied: boolean;
    if (error) {
      applied = false;
    } else if (probe.kind === "backfill") {
      // Applied only once every row has a value, and vacuously true with no rows.
      const rows = (data ?? []) as unknown as Array<Record<string, unknown>>;
      applied = rows.every((row) => row[probe.column] != null);
    } else {
      applied = true;
    }

    if (!applied) pending.push(probe.file);
    console.log(
      `  ${applied ? "applied" : "PENDING"}  ${probe.file.padEnd(22)} ${probe.what}`,
    );
  }

  // 0002 schedules pg_cron, which adds no column and cannot be probed this way.
  console.log(`  unknown  ${"0002_tick_cron".padEnd(22)} pg_cron schedule — check cron.job in SQL`);

  const { data } = await db.from("workspaces").select("venture_name, webhook_secret");
  if (data) {
    console.log("\nVentures\n");
    for (const w of data as Array<{ venture_name: string; webhook_secret: string | null }>) {
      console.log(`  ${w.venture_name.padEnd(20)} webhook secret ${w.webhook_secret ? "set" : "not set"}`);
    }
  }

  if (pending.length > 0) {
    console.log(`\n${pending.length} pending. Paste these into the Supabase SQL editor:\n`);
    for (const file of pending) console.log(`  supabase/migrations/${file}.sql`);
  } else {
    console.log("\nEverything probeable is applied.");
  }
  console.log();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
