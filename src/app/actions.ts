"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { logEvent } from "@/lib/day";
import { moveIssueTo } from "@/lib/linear/mutations";

import type { Level, Result } from "@/lib/notify";

export type ActionResult = Result;

/**
 * The three Now-view actions, plus swap.
 *
 * Each writes the event log first and Linear second: the log is what the recap
 * reads, and a Linear outage should not cost us the record that TP started.
 * The returned note surfaces a partial success rather than swallowing it.
 */

export async function startTask(dayId: string, issueId: string): Promise<ActionResult> {
  await logEvent(dayId, "started", { issueId });

  let note: string | undefined;
  let level: Level | undefined;
  try {
    const result = await moveIssueTo(issueId, "started");
    note = result.note;
    level = result.level;
  } catch (err) {
    note = `Marked here, but Linear did not update: ${err instanceof Error ? err.message : String(err)}`;
    level = "warning";
  }

  revalidatePath("/");
  return { ok: true, note, level };
}

export async function completeTask(dayId: string, issueId: string): Promise<ActionResult> {
  await logEvent(dayId, "done", { issueId });

  let note: string | undefined;
  let level: Level | undefined;
  try {
    const result = await moveIssueTo(issueId, "completed");
    note = result.note;
    level = result.level;
  } catch (err) {
    note = `Marked here, but Linear did not update: ${err instanceof Error ? err.message : String(err)}`;
    level = "warning";
  }

  revalidatePath("/");
  return { ok: true, note, level };
}

export async function blockTask(
  dayId: string,
  issueId: string,
  reason: string,
): Promise<ActionResult> {
  const trimmed = reason.trim();
  if (!trimmed) return { ok: false, note: "A blocker needs a reason — one line is enough." };

  // Deliberately does not touch Linear: being blocked is a fact about TP's day,
  // not a workflow state, and guessing at a "Blocked" column would be wrong.
  await logEvent(dayId, "blocked", { issueId, note: trimmed });

  revalidatePath("/");
  return { ok: true };
}

export async function swapNeedleMover(
  dayId: string,
  fromIssueId: string,
  toIssueId: string,
): Promise<ActionResult> {
  await db().from("days").update({ needle_mover_id: toIssueId }).eq("id", dayId);

  // `related_issue_id` records what was chosen instead, which is the signal
  // Phase 5 tunes the weights from.
  await logEvent(dayId, "swapped", { issueId: fromIssueId, relatedIssueId: toIssueId });

  revalidatePath("/");
  return { ok: true };
}

/** Plans today on demand, for when TP opens the app before the brief fires. */
export async function planToday(): Promise<ActionResult> {
  const { planDay } = await import("@/lib/day");
  const { syncAll } = await import("@/lib/linear/sync");
  try {
    // Sync first: picking from a stale cache would rank issues that were
    // closed in Linear hours ago.
    const synced = await syncAll();
    const failed = synced.filter((s) => s.error);

    if (synced.length > 0 && failed.length === synced.length) {
      const first = failed[0];
      return {
        ok: false,
        note: first.local
          ? first.error // already says what to fix; do not blame Linear for it
          : `Could not reach Linear: ${first.error}`,
      };
    }

    const result = await planDay(new Date());
    revalidatePath("/");
    if (result.status === "no-candidates") {
      return { ok: false, note: "Nothing open and unblocked is assigned to you right now." };
    }
    return result.repairs.length
      ? { ok: true, note: `Picked, with adjustments: ${result.repairs.join("; ")}`, level: "info" }
      : { ok: true, note: "Today is picked." };
  } catch (err) {
    return { ok: false, note: err instanceof Error ? err.message : String(err) };
  }
}

/** Closes the day: snapshots progress, writes the recap, emails it. */
export async function closeToday(): Promise<ActionResult> {
  const { closeDay } = await import("@/lib/day");
  try {
    const result = await closeDay(new Date());
    revalidatePath("/");

    if (result.status === "already-closed") {
      return { ok: true, note: "Today was already closed.", level: "info" };
    }
    // A note here means some project updates did not reach Linear.
    if (result.note) return { ok: true, note: result.note, level: "warning" };
    return {
      ok: true,
      note:
        result.postedUpdates > 0
          ? `Day closed. ${result.postedUpdates} project update(s) posted to Linear.`
          : "Day closed.",
    };
  } catch (err) {
    return { ok: false, note: err instanceof Error ? err.message : String(err) };
  }
}

/** Reopens today after it has been closed. */
export async function reopenToday(): Promise<ActionResult> {
  const { getSettings, reopenDay } = await import("@/lib/day");
  const { localDate } = await import("@/lib/time");

  try {
    const settings = await getSettings();
    const result = await reopenDay(localDate(new Date(), settings.timezone));
    revalidatePath("/");
    return { ok: result.reopened, note: result.note ?? "Reopened." };
  } catch (err) {
    return { ok: false, note: err instanceof Error ? err.message : String(err) };
  }
}
