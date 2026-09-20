"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { decrypt, encrypt } from "@/lib/crypto";
import { currentUser } from "@/lib/supabase/server";
import { isValidTimezone } from "@/lib/time";
import { createLinearClient } from "@/lib/linear/client";
import { VIEWER } from "@/lib/linear/queries";

export type SettingsResult = { ok: boolean; note?: string };

/**
 * Every action re-checks the session. Middleware already gates the page, but a
 * server action is its own endpoint and can be POSTed to directly.
 */
async function guard(): Promise<void> {
  if (!(await currentUser())) throw new Error("Not signed in.");
}

export async function saveSchedule(formData: FormData): Promise<SettingsResult> {
  await guard();

  const email = String(formData.get("email") ?? "").trim();
  const timezone = String(formData.get("timezone") ?? "").trim();
  const briefTime = String(formData.get("brief_time") ?? "").trim();
  const cutoff = String(formData.get("close_cutoff_time") ?? "").trim();
  const pausedUntil = String(formData.get("paused_until") ?? "").trim();

  if (!email.includes("@")) return { ok: false, note: "That does not look like an email address." };
  if (timezone && !isValidTimezone(timezone)) {
    return { ok: false, note: `"${timezone}" is not a valid IANA timezone.` };
  }

  const { error } = await db()
    .from("settings")
    .update({
      email,
      ...(timezone ? { timezone } : {}),
      brief_time: briefTime,
      close_cutoff_time: cutoff,
      weekdays_only: formData.get("weekdays_only") === "on",
      paused_until: pausedUntil || null,
      updated_at: new Date().toISOString(),
    })
    .eq("singleton", true);

  if (error) return { ok: false, note: error.message };

  revalidatePath("/settings");
  revalidatePath("/");
  return { ok: true, note: "Saved." };
}

export async function addWorkspace(formData: FormData): Promise<SettingsResult> {
  await guard();

  const name = String(formData.get("venture_name") ?? "").trim();
  const apiKey = String(formData.get("api_key") ?? "").trim();

  if (!name) return { ok: false, note: "Give the venture a name." };
  if (!apiKey) return { ok: false, note: "Paste a Linear personal API key." };

  // Verify before storing. A key that does not work is worse than no key:
  // it fails silently inside a scheduled job at 07:00.
  let orgId: string | null = null;
  try {
    const data = await createLinearClient(apiKey).request<{
      organization: { id: string; name: string };
    }>(VIEWER);
    orgId = data.organization.id;
  } catch (err) {
    return {
      ok: false,
      note: `Linear rejected that key: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const { error } = await db().from("workspaces").insert({
    venture_name: name,
    linear_org_id: orgId,
    api_key: encrypt(apiKey),
    is_private: formData.get("is_private") === "on",
    active: true,
  });

  if (error) return { ok: false, note: error.message };

  revalidatePath("/settings");
  return { ok: true, note: `Added ${name}.` };
}

export async function setWorkspaceFlag(
  id: string,
  field: "active" | "is_private",
  value: boolean,
): Promise<SettingsResult> {
  await guard();
  const { error } = await db()
    .from("workspaces")
    .update({ [field]: value })
    .eq("id", id);
  if (error) return { ok: false, note: error.message };

  revalidatePath("/settings");
  revalidatePath("/");
  return { ok: true };
}

/**
 * Removes a workspace and, by cascade, its cached projects and issues.
 * Deliberately not offered as a one-click action in the UI without a typed
 * confirmation — it is the only destructive control on the page.
 */
export async function removeWorkspace(id: string, confirmation: string): Promise<SettingsResult> {
  await guard();

  const { data } = await db().from("workspaces").select("venture_name").eq("id", id).maybeSingle();
  const name = (data as { venture_name: string } | null)?.venture_name;
  if (!name) return { ok: false, note: "That venture no longer exists." };

  if (confirmation.trim() !== name) {
    return { ok: false, note: `Type "${name}" exactly to remove it.` };
  }

  const { error } = await db().from("workspaces").delete().eq("id", id);
  if (error) return { ok: false, note: error.message };

  revalidatePath("/settings");
  revalidatePath("/");
  return { ok: true, note: `Removed ${name}. Its cached issues went with it; Linear is untouched.` };
}

export async function disconnectCalendar(): Promise<SettingsResult> {
  await guard();
  const { error } = await db().from("google_accounts").delete().eq("singleton", true);
  if (error) return { ok: false, note: error.message };

  revalidatePath("/settings");
  return { ok: true, note: "Calendar disconnected. Calendar fit falls back to neutral." };
}

export type TeamOption = { id: string; key: string; name: string };

/** Teams reachable with this venture's key, for the scope picker. */
export async function listTeams(workspaceId: string): Promise<TeamOption[]> {
  await guard();

  const { data } = await db().from("workspaces").select("api_key").eq("id", workspaceId).maybeSingle();
  const key = (data as { api_key: string } | null)?.api_key;
  if (!key) return [];

  const { TEAMS } = await import("@/lib/linear/queries");
  const result = await createLinearClient(decrypt(key)).request<{
    teams: { nodes: TeamOption[] };
  }>(TEAMS);

  return result.teams.nodes;
}

/**
 * Scopes a venture to one Linear team, or back to the whole organisation.
 *
 * Clears this venture's cached rows on the way: they were fetched under the
 * old scope, and leaving them would mean the next sync's mark-and-sweep is the
 * only thing standing between you and issues from a team you just excluded.
 */
export async function setWorkspaceTeam(
  workspaceId: string,
  team: TeamOption | null,
): Promise<SettingsResult> {
  await guard();

  const { error } = await db()
    .from("workspaces")
    .update({
      linear_team_id: team?.id ?? null,
      linear_team_key: team?.key ?? null,
    })
    .eq("id", workspaceId);

  if (error) return { ok: false, note: error.message };

  await db().from("issues").delete().eq("workspace_id", workspaceId);
  await db().from("projects").delete().eq("workspace_id", workspaceId);

  revalidatePath("/settings");
  revalidatePath("/");
  return {
    ok: true,
    note: team ? `Scoped to ${team.key}. Syncs on the next tick.` : "Scoped to the whole organisation.",
  };
}

/**
 * Refreshes the local cache from Linear.
 *
 * Nothing syncs on a schedule any more, so the cache is only as fresh as the
 * last time a day was planned. Reshuffling priorities or deleting issues in
 * Linear is invisible here until this runs.
 *
 * Note what it does not do: today's picks were already chosen and written to
 * the day row, so syncing updates the underlying issues without re-ranking
 * them. Changing what the day shows needs a re-pick.
 */
export async function syncNow(): Promise<SettingsResult> {
  await guard();

  const { syncAll } = await import("@/lib/linear/sync");
  const results = await syncAll();

  if (results.length === 0) return { ok: false, note: "No active ventures to sync." };

  const failed = results.filter((r) => r.error);
  const issues = results.reduce((n, r) => n + r.issues, 0);
  const targeted = results.reduce((n, r) => n + r.targetedProjects, 0);

  revalidatePath("/");
  revalidatePath("/settings");

  if (failed.length === results.length) {
    return { ok: false, note: failed[0].error };
  }

  const note =
    `${results.length - failed.length}/${results.length} ventures, ${issues} open issues, ` +
    `${targeted} targeted project(s).` +
    (failed.length ? ` ${failed.map((f) => `${f.ventureName} failed`).join(", ")}.` : "");

  return { ok: true, note };
}

/**
 * Re-ranks today and asks Claude again.
 *
 * Separate from syncing because it is the expensive half and it discards the
 * day's existing picks. What you did today survives: start, blocked and done
 * are events, and re-picking does not un-happen them.
 */
export async function repickToday(): Promise<SettingsResult> {
  await guard();

  const { planToday } = await import("@/app/actions");
  const result = await planToday();
  revalidatePath("/");
  return { ok: result.ok, note: result.note ?? (result.ok ? "Today re-picked." : undefined) };
}
