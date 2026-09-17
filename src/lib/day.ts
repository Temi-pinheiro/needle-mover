import { db, unwrap } from "@/lib/db/client";
import { decrypt } from "@/lib/crypto";
import type { Day, DayEvent, GoogleAccount, Issue, Project, Settings, Workspace } from "@/lib/db/types";
import { busyIntervals } from "@/lib/google/client";
import { computeFreeBlocks, DAY_START_HOUR, largestFreeBlock } from "@/lib/google/freebusy";
import { pickNeedleMover, type FreeBlock as PromptBlock } from "@/lib/claude/pick";
import { scoreAll } from "@/lib/scoring/score";
import type { Candidate } from "@/lib/scoring/types";
import { addDays, localDate, localInstant, localTime } from "@/lib/time";

/** How far back to look when computing a carry-over streak. */
const CARRYOVER_LOOKBACK_DAYS = 5;

export async function getSettings(): Promise<Settings> {
  return unwrap(await db().from("settings").select("*").single()) as Settings;
}

export async function getGoogleAccount(): Promise<GoogleAccount | null> {
  const { data } = await db().from("google_accounts").select("*").maybeSingle();
  return (data as GoogleAccount | null) ?? null;
}

/**
 * Gets or creates today's row.
 *
 * Both the tick and a page load call this, so it must be safe to race: the
 * insert relies on the unique constraint on `days.date` and falls back to a
 * read when a concurrent caller won.
 */
export async function materializeDay(date: string, timezone: string): Promise<Day> {
  const existing = await db().from("days").select("*").eq("date", date).maybeSingle();
  if (existing.data) return existing.data as Day;

  const inserted = await db().from("days").insert({ date, timezone }).select("*").single();
  if (inserted.data) return inserted.data as Day;

  // Someone else inserted between our read and our write.
  return unwrap(await db().from("days").select("*").eq("date", date).single()) as Day;
}

/** Builds the scoring candidates from the cached Linear data. */
export async function loadCandidates(): Promise<Candidate[]> {
  const [issues, projects, workspaces] = await Promise.all([
    db().from("issues").select("*"),
    db().from("projects").select("*"),
    db().from("workspaces").select("*").eq("active", true),
  ]);

  const projectById = new Map(
    ((projects.data ?? []) as Project[]).map((p) => [p.id, p]),
  );
  const ventureById = new Map(
    ((workspaces.data ?? []) as Workspace[]).map((w) => [w.id, w.venture_name]),
  );

  return ((issues.data ?? []) as Issue[])
    // Only issues from an active workspace; a deactivated venture should
    // vanish from ranking without deleting its cache.
    .filter((issue) => ventureById.has(issue.workspace_id))
    .map((issue) => {
      const project = issue.project_id ? projectById.get(issue.project_id) : null;
      return {
        issue: {
          id: issue.id,
          identifier: issue.identifier,
          title: issue.title,
          workspaceId: issue.workspace_id,
          ventureName: ventureById.get(issue.workspace_id) ?? "Unknown",
          priority: issue.priority,
          estimate: issue.estimate,
          dueDate: issue.due_date,
          stateType: issue.state_type,
          blocksCount: issue.blocks_count,
          isBlocked: issue.is_blocked,
        },
        project: project
          ? {
              id: project.id,
              name: project.name,
              targetDate: project.target_date,
              progress: project.progress,
              scopeEstimate: project.scope_estimate,
            }
          : null,
      };
    });
}

/**
 * How many consecutive days the same needle mover has gone unfinished.
 *
 * Walks back from yesterday and stops at the first day that was finished, had
 * no needle mover, or had a different one — so the streak only ever describes
 * one issue.
 */
export async function carryOverMap(today: string): Promise<Record<string, number>> {
  const since = addDays(today, -CARRYOVER_LOOKBACK_DAYS);
  const days = ((
    await db()
      .from("days")
      .select("*")
      .gte("date", since)
      .lt("date", today)
      .order("date", { ascending: false })
  ).data ?? []) as Day[];

  if (days.length === 0) return {};

  const events = ((
    await db()
      .from("day_events")
      .select("*")
      .in("day_id", days.map((d) => d.id))
      .eq("type", "done")
  ).data ?? []) as DayEvent[];

  const finished = new Set(events.map((e) => `${e.day_id}:${e.issue_id}`));

  let issueId: string | null = null;
  let streak = 0;

  for (const day of days) {
    if (!day.needle_mover_id) break;
    if (issueId && day.needle_mover_id !== issueId) break;
    if (finished.has(`${day.id}:${day.needle_mover_id}`)) break;
    issueId = day.needle_mover_id;
    streak++;
  }

  return issueId ? { [issueId]: streak } : {};
}

/**
 * Today's free calendar blocks, between the start of the working day (or now,
 * if later) and the close-day cutoff.
 */
export async function todaysFreeBlocks(
  settings: Settings,
  google: GoogleAccount | null,
  now: Date,
): Promise<ReturnType<typeof computeFreeBlocks>> {
  if (!google) return [];

  const date = localDate(now, settings.timezone);
  const dayStart = localInstant(date, `${String(DAY_START_HOUR).padStart(2, "0")}:00`, settings.timezone);
  const windowStart = new Date(Math.max(dayStart.getTime(), now.getTime()));
  const windowEnd = localInstant(date, settings.close_cutoff_time.slice(0, 5), settings.timezone);

  if (windowEnd <= windowStart) return [];

  try {
    const busy = await busyIntervals(decrypt(google.refresh_token), windowStart, windowEnd);
    return computeFreeBlocks(busy, windowStart.toISOString(), windowEnd.toISOString());
  } catch {
    // A calendar outage must not cost TP the brief; calendar fit scores
    // neutral when there are no blocks.
    return [];
  }
}

export type PlanResult =
  | { status: "planned"; day: Day; repairs: string[]; degraded: boolean }
  | { status: "no-candidates" };

/**
 * Scores today's candidates, asks Claude to pick, and writes the result onto
 * the day row. Idempotent by caller contract: only run when the day has no
 * needle mover yet.
 */
export async function planDay(now: Date): Promise<PlanResult> {
  const settings = await getSettings();
  const google = await getGoogleAccount();
  const today = localDate(now, settings.timezone);

  const day = await materializeDay(today, settings.timezone);

  const [candidates, carryOver, freeBlocks] = await Promise.all([
    loadCandidates(),
    carryOverMap(today),
    todaysFreeBlocks(settings, google, now),
  ]);

  const largest = largestFreeBlock(freeBlocks);
  const scoring = scoreAll(candidates, {
    today,
    largestFreeBlockHours: largest?.hours ?? null,
    carryOver,
  });

  if (scoring.shortlist.length === 0) return { status: "no-candidates" };

  const promptBlocks: PromptBlock[] = freeBlocks.map((b) => ({
    start: localTime(new Date(b.start), settings.timezone),
    end: localTime(new Date(b.end), settings.timezone),
    hours: b.hours,
  }));

  const pick = await pickNeedleMover({
    today,
    timezone: settings.timezone,
    freeBlocks: promptBlocks,
    scoring,
  });

  const updated = unwrap(
    await db()
      .from("days")
      .update({
        needle_mover_id: pick.needleMover.candidate.issue.id,
        backup_id: pick.backup?.candidate.issue.id ?? null,
        also_today_ids: pick.alsoToday.map((a) => a.candidate.issue.id),
        reason: pick.reason,
        first_step: pick.firstStep,
        plain_focus: pick.plainFocus,
        focus_window_start: largest?.start ?? null,
        focus_window_end: largest?.end ?? null,
        degraded_scoring: scoring.degraded,
      })
      .eq("id", day.id)
      .select("*")
      .single(),
  ) as Day;

  await snapshotProgress(today, "open");

  return { status: "planned", day: updated, repairs: pick.repairs, degraded: scoring.degraded };
}

/** Records where every targeted project stood, for the recap's before/after. */
export async function snapshotProgress(date: string, moment: "open" | "close"): Promise<void> {
  const projects = ((await db().from("projects").select("id, progress").not("target_date", "is", null))
    .data ?? []) as Array<{ id: string; progress: number }>;

  if (projects.length === 0) return;

  await db()
    .from("progress_snapshots")
    .upsert(
      projects.map((p) => ({ project_id: p.id, date, moment, progress: p.progress })),
      { onConflict: "project_id,date,moment" },
    );
}

export async function logEvent(
  dayId: string,
  type: DayEvent["type"],
  fields: { issueId?: string | null; relatedIssueId?: string | null; note?: string } = {},
): Promise<void> {
  await db().from("day_events").insert({
    day_id: dayId,
    type,
    issue_id: fields.issueId ?? null,
    related_issue_id: fields.relatedIssueId ?? null,
    note: fields.note ?? null,
  });
}

/**
 * Closing the day.
 *
 * Order matters: sync first so "closed today" and the progress figures are
 * current, then snapshot, then gather. Snapshotting before the sync would
 * report yesterday's numbers as today's close.
 */
export type CloseResult =
  | { status: "closed"; recapSent: boolean; note?: string }
  | { status: "already-closed" };

export async function closeDay(now: Date): Promise<CloseResult> {
  const settings = await getSettings();
  const today = localDate(now, settings.timezone);
  const day = await materializeDay(today, settings.timezone);

  if (day.status === "closed") return { status: "already-closed" };

  const { syncAll } = await import("@/lib/linear/sync");
  await syncAll();
  await snapshotProgress(today, "close");

  const { gatherRecap } = await import("@/lib/recap");
  const facts = await gatherRecap(day, settings);

  // Tomorrow's candidate comes from the scorer, not from Claude — the same
  // ranking that will run in the morning, so the recap does not promise
  // something the brief then contradicts.
  const [candidates, carryOver] = await Promise.all([
    loadCandidates(),
    carryOverMap(addDays(today, 1)),
  ]);
  const ranked = scoreAll(candidates, {
    today: addDays(today, 1),
    largestFreeBlockHours: null,
    carryOver,
  });
  const top = ranked.ranked[0]?.candidate.issue ?? null;
  const tomorrow = top
    ? { identifier: top.identifier, title: top.title, ventureName: top.ventureName }
    : null;

  const { writeRecap } = await import("@/lib/claude/recap");
  const text = await writeRecap(facts, tomorrow);

  await db()
    .from("days")
    .update({
      status: "closed",
      closed_at: new Date().toISOString(),
      recap_summary: text.summary,
      recap_tomorrow_note: text.tomorrow_note,
      recap_tomorrow_id: top?.id ?? null,
    })
    .eq("id", day.id);

  // The day is closed either way; a failed send is reported, not fatal.
  let recapSent = false;
  let note: string | undefined;
  try {
    const { sendRecap } = await import("@/lib/email/send");
    await sendRecap(settings.email, {
      date: today,
      summary: text.summary,
      needleMover: facts.needleMover,
      needleMoverDone: facts.needleMoverDone,
      blockReason: facts.blockReason,
      closed: facts.closed,
      movements: facts.movements,
      tomorrow,
      tomorrowNote: text.tomorrow_note,
      appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
    });
    await db().from("days").update({ recap_sent_at: new Date().toISOString() }).eq("id", day.id);
    recapSent = true;
  } catch (err) {
    note = `The day is closed, but the recap email did not send: ${
      err instanceof Error ? err.message : String(err)
    }`;
  }

  return { status: "closed", recapSent, note };
}
