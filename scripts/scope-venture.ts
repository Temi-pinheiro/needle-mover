/**
 * Scopes a venture to one Linear team from the command line.
 *
 * Mirrors the Settings picker, including clearing that venture's cached rows:
 * they were fetched under the old scope, and leaving them would mean the next
 * sync's mark-and-sweep is the only thing standing between you and issues from
 * a team you just excluded.
 *
 *   pnpm scope --venture Northbound --team TEM
 *   pnpm scope --venture Halyard --team BUI
 *   pnpm scope --venture Halyard --whole-org
 *   pnpm scope --list
 */
import { createClient } from "@supabase/supabase-js";
import { decrypt } from "../src/lib/crypto";
import { createLinearClient } from "../src/lib/linear/client";
import { TEAMS } from "../src/lib/linear/queries";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
};

type Row = { id: string; venture_name: string; api_key: string; linear_team_key: string | null };

async function main() {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const { data, error } = await db
    .from("workspaces")
    .select("id, venture_name, api_key, linear_team_key");
  if (error) throw new Error(error.message);
  const workspaces = (data ?? []) as Row[];

  if (process.argv.includes("--list") || !arg("venture")) {
    console.log("\nVentures and the teams their key can reach\n");
    for (const w of workspaces) {
      const teams = await createLinearClient(decrypt(w.api_key)).request<{
        teams: { nodes: Array<{ key: string; name: string }> };
      }>(TEAMS);
      console.log(
        `  ${w.venture_name.padEnd(14)} currently ${(w.linear_team_key ?? "whole org").padEnd(10)}  teams: ${teams.teams.nodes
          .map((t) => `${t.key} (${t.name})`)
          .join(", ")}`,
      );
    }
    console.log("\n  pnpm scope --venture <name> --team <KEY>\n");
    return;
  }

  const name = arg("venture")!;
  const workspace = workspaces.find((w) => w.venture_name.toLowerCase() === name.toLowerCase());
  if (!workspace) {
    console.error(`No venture called "${name}". Have: ${workspaces.map((w) => w.venture_name).join(", ")}`);
    process.exit(1);
  }

  let update: { linear_team_id: string | null; linear_team_key: string | null };

  if (process.argv.includes("--whole-org")) {
    update = { linear_team_id: null, linear_team_key: null };
  } else {
    const wanted = arg("team");
    if (!wanted) {
      console.error("Need --team <KEY> or --whole-org.");
      process.exit(1);
    }
    const teams = await createLinearClient(decrypt(workspace.api_key)).request<{
      teams: { nodes: Array<{ id: string; key: string; name: string }> };
    }>(TEAMS);
    const team = teams.teams.nodes.find((t) => t.key.toLowerCase() === wanted.toLowerCase());
    if (!team) {
      console.error(
        `That key cannot reach a team called "${wanted}". It can reach: ${teams.teams.nodes.map((t) => t.key).join(", ")}`,
      );
      process.exit(1);
    }
    update = { linear_team_id: team.id, linear_team_key: team.key };
  }

  const { error: updateError } = await db.from("workspaces").update(update).eq("id", workspace.id);
  if (updateError) throw new Error(updateError.message);

  // Cached rows belong to the previous scope.
  await db.from("issues").delete().eq("workspace_id", workspace.id);
  await db.from("projects").delete().eq("workspace_id", workspace.id);

  console.log(
    `\n  ${workspace.venture_name} → ${update.linear_team_key ?? "whole organisation"}. Cached rows cleared; syncs on the next tick.\n`,
  );
}

main().catch((err) => {
  console.error(`\n${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
