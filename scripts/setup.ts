/**
 * Seeds the two rows the app cannot create for itself.
 *
 * The Linear key is stored as AES-GCM ciphertext, so it cannot be pasted
 * straight into Postgres — this encrypts it on the way in. Replaced by the
 * settings page later; until then it is how you get running.
 *
 *   pnpm seed settings --email you@example.com --tz Africa/Lagos
 *   pnpm seed workspace --name Meridian --key lin_api_xxx
 *   pnpm seed show
 */
import { createClient } from "@supabase/supabase-js";
import { encrypt } from "../src/lib/crypto";
import { isValidTimezone } from "../src/lib/time";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

function required(...names: string[]): void {
  const missing = names.filter((n) => !process.env[n]);
  if (missing.length) {
    console.error(`Missing env: ${missing.join(", ")}. Copy .env.example to .env.local first.`);
    process.exit(1);
  }
}

function client() {
  required("NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}

async function settings() {
  const db = client();
  const { data: current } = await db.from("settings").select("*").maybeSingle();

  const email = arg("email") ?? current?.email;
  const timezone = arg("tz") ?? current?.timezone ?? "UTC";

  if (!email) {
    console.error("Need --email. This is where the morning brief is sent.");
    process.exit(1);
  }
  if (!isValidTimezone(timezone)) {
    console.error(`"${timezone}" is not a valid IANA timezone, e.g. Africa/Lagos.`);
    process.exit(1);
  }

  // Merge over whatever is already stored: changing one field must not silently
  // reset the others to their defaults.
  const row = {
    singleton: true,
    email,
    timezone,
    brief_time: arg("brief") ?? current?.brief_time ?? "07:00",
    close_cutoff_time: arg("cutoff") ?? current?.close_cutoff_time ?? "19:00",
    weekdays_only:
      arg("weekends") !== undefined ? arg("weekends") !== "true" : (current?.weekdays_only ?? true),
    paused_until:
      process.argv.includes("--resume") ? null : (arg("pause-until") ?? current?.paused_until ?? null),
    updated_at: new Date().toISOString(),
  };

  const { error } = await db.from("settings").upsert(row, { onConflict: "singleton" });
  if (error) throw new Error(error.message);

  console.log(`\n${current ? "Settings updated" : "Settings saved"}.`);
  console.log(`  brief   ${row.brief_time} ${row.timezone}${row.weekdays_only ? " (weekdays)" : " (every day)"}`);
  console.log(`  cutoff  ${row.close_cutoff_time}`);
  console.log(`  email   ${row.email}`);
  console.log(
    row.paused_until ? `  paused  through ${row.paused_until}\n` : "  paused  no\n",
  );
  console.log(`The timezone refreshes from your primary Google Calendar on every tick,`);
  console.log(`so this value only matters until Calendar is connected.\n`);
}

async function workspace() {
  required("ENCRYPTION_KEY");
  const name = arg("name");
  const key = arg("key") ?? process.env.LINEAR_API_KEY;

  if (!name || !key) {
    console.error("Need --name <venture> and --key <lin_api_...> (or LINEAR_API_KEY set).");
    process.exit(1);
  }

  const { error } = await client()
    .from("workspaces")
    .insert({
      venture_name: name,
      api_key: encrypt(key),
      is_private: arg("private") === "true",
      active: true,
    });
  if (error) throw new Error(error.message);

  console.log(`\nAdded "${name}". The key is encrypted at rest.`);
  console.log(`Run pnpm linear:check to confirm it works before the first brief.\n`);
}

async function show() {
  const db = client();
  const [settingsRes, workspacesRes, googleRes] = await Promise.all([
    db
      .from("settings")
      .select("email, brief_time, close_cutoff_time, timezone, weekdays_only, paused_until")
      .maybeSingle(),
    db.from("workspaces").select("venture_name, active, is_private, last_synced_at"),
    db.from("google_accounts").select("email, timezone").maybeSingle(),
  ]);

  // A failed query is not an empty one. Reporting "not set" for a column that
  // does not exist sends you looking for a missing row that is right there.
  const value = <T, E>(
    res: { data: T | null; error: { message: string } | null },
    empty: E,
  ): T | E | string => {
    if (res.error) return `QUERY FAILED — ${res.error.message}`;
    return res.data ?? empty;
  };

  console.log("\nSettings  ", value(settingsRes, "not set — run `pnpm seed settings`"));
  console.log("Calendar  ", value(googleRes, "not connected — visit /api/google/start"));

  const workspaces = value(workspacesRes, []);
  console.log(
    "Ventures  ",
    Array.isArray(workspaces) && workspaces.length === 0
      ? "none — run `pnpm seed workspace`"
      : workspaces,
  );
  console.log();
}

const commands: Record<string, () => Promise<void>> = { settings, workspace, show };
const command = commands[process.argv[2] ?? ""];

if (!command) {
  console.error("Usage: pnpm seed <settings|workspace|show> [flags]");
  process.exit(1);
}

command().catch((err) => {
  console.error(`\n${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
