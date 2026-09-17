"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { encrypt } from "@/lib/crypto";
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
