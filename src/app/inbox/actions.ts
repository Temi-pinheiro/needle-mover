"use server";

import { revalidatePath } from "next/cache";
import { db, unwrap } from "@/lib/db/client";
import type { Capture, ProposedIssue } from "@/lib/db/types";
import { currentUser } from "@/lib/supabase/server";
import { captureText, retryCapture } from "@/lib/capture/pipeline";
import { issueDescription, TITLE_MAX, validDueDate } from "@/lib/capture/resolve";
import { removeAudio } from "@/lib/capture/storage";
import { createIssue } from "@/lib/linear/mutations";
import { getSettings } from "@/lib/day";
import { localDate } from "@/lib/time";
import type { Result } from "@/lib/notify";

export type CaptureResult = Result & { url?: string | null };

/** A server action is its own endpoint and can be POSTed to directly. */
async function guard(): Promise<void> {
  if (!(await currentUser())) throw new Error("Not signed in.");
}

function refresh() {
  revalidatePath("/inbox");
  revalidatePath("/");
}

export async function submitCapture(text: string): Promise<CaptureResult> {
  await guard();
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, note: "Nothing to capture." };
  if (trimmed.length > 4000) return { ok: false, note: "That is a document, not a capture. Keep it under 4,000 characters." };

  try {
    const { note } = await captureText(trimmed);
    refresh();
    // A note means it was saved but Claude could not read it.
    return note ? { ok: true, note, level: "warning" } : { ok: true, note: "In the inbox." };
  } catch (err) {
    // Only the insert itself can get here, so nothing was saved.
    return { ok: false, note: `Not saved: ${err instanceof Error ? err.message : String(err)}` };
  }
}

function proposalFrom(formData: FormData, today: string): ProposedIssue {
  const field = (name: string) => String(formData.get(name) ?? "").trim();
  return {
    title: field("title").slice(0, TITLE_MAX),
    workspace_id: field("workspace_id") || null,
    project_id: field("project_id") || null,
    due_date: validDueDate(field("due_date") || null, today),
    description: field("description") || null,
  };
}

/**
 * Creates the issue in Linear, and only then. The row is claimed before the
 * call so a double click cannot file the same capture twice, and released if
 * Linear refuses, so a failure leaves it in the inbox to try again.
 */
export async function approveCapture(id: string, formData: FormData): Promise<CaptureResult> {
  await guard();

  const settings = await getSettings();
  const proposal = proposalFrom(formData, localDate(new Date(), settings.timezone));

  // Keep the edits whatever happens next, so a refused approval loses nothing.
  await db().from("captures").update({ proposed_issue: proposal }).eq("id", id).eq("status", "pending");

  if (!proposal.title) return { ok: false, note: "Give it a title first." };
  if (!proposal.workspace_id) return { ok: false, note: "Choose which venture it belongs to." };

  const { data: claimed } = await db()
    .from("captures")
    .update({ status: "approved", resolved_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();
  if (!claimed) return { ok: false, note: "That capture was already resolved." };
  const capture = claimed as Capture;

  const release = () =>
    db().from("captures").update({ status: "pending", resolved_at: null }).eq("id", id);

  let result: Awaited<ReturnType<typeof createIssue>>;
  try {
    result = await createIssue({
      workspaceId: proposal.workspace_id,
      projectId: proposal.project_id,
      title: proposal.title,
      description: issueDescription(proposal.description, capture.raw_text),
      dueDate: proposal.due_date,
    });
  } catch (err) {
    await release();
    return { ok: false, note: `Linear did not take it: ${err instanceof Error ? err.message : String(err)}` };
  }

  if (!result.ok) {
    await release();
    return { ok: false, note: result.note };
  }

  await db()
    .from("captures")
    .update({ linear_issue_id: result.issue.id, audio_path: null })
    .eq("id", id);
  if (capture.audio_path) await removeAudio(capture.audio_path);

  refresh();
  return { ok: true, note: `Filed as ${result.issue.identifier}.`, url: result.issue.url };
}

export async function discardCapture(id: string): Promise<CaptureResult> {
  await guard();

  // Read the clip's path first: the update clears it.
  const capture = unwrap(await db().from("captures").select("*").eq("id", id).single()) as Capture;
  if (capture.status !== "pending") return { ok: false, note: "That capture was already resolved." };

  await db()
    .from("captures")
    .update({ status: "discarded", resolved_at: new Date().toISOString(), audio_path: null })
    .eq("id", id)
    .eq("status", "pending");
  if (capture.audio_path) await removeAudio(capture.audio_path);

  refresh();
  return { ok: true, note: "Discarded." };
}

export async function retryCaptureAction(id: string): Promise<CaptureResult> {
  await guard();
  try {
    const { note } = await retryCapture(id);
    refresh();
    return note ? { ok: false, note } : { ok: true, note: "Claude read it." };
  } catch (err) {
    return { ok: false, note: err instanceof Error ? err.message : String(err) };
  }
}
