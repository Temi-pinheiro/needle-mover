import { db, unwrap } from "@/lib/db/client";
import { decrypt, safeEqual } from "@/lib/crypto";
import type { Day, DayEvent, Issue, Project, Settings, Workspace } from "@/lib/db/types";
import {
  carryOverMap,
  getGoogleAccount,
  getSettings,
  materializeDay,
  planDay,
} from "@/lib/day";
import { primaryCalendar } from "@/lib/google/client";
import { syncAll } from "@/lib/linear/sync";
import { sendBrief, sendCloseReminder } from "@/lib/email/send";
import { middayTime, pushToAll } from "@/lib/push";
import { nowState } from "@/lib/day-state";
import { needsSplitPrompt } from "@/lib/scoring/score";
import { hasPassed, isValidTimezone, isWeekend, localDate, localTime } from "@/lib/time";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The scheduler. Called every 15 minutes by Supabase pg_cron.
 *
 * Runs in UTC and asks what the local time is on every pass, which is what
 * makes moving between Lagos and Bali a no-op. Each timed step claims its
 * column on the `days` row before doing any work, so two overlapping ticks
 * can never send the same thing twice.
 */

type StepColumn = "brief_sent_at" | "nudge_sent_at" | "reminder_sent_at" | "recap_sent_at";

/**
 * Atomically takes ownership of a step. Returns false if another tick got
 * there first — the `is(column, null)` filter is the lock.
 */
async function claim(dayId: string, column: StepColumn): Promise<boolean> {
  const { data } = await db()
    .from("days")
    .update({ [column]: new Date().toISOString() })
    .eq("id", dayId)
    .is(column, null)
    .select("id");
  return (data?.length ?? 0) === 1;
}

/** Hands a claimed step back so the next tick retries it. */
async function release(dayId: string, column: StepColumn): Promise<void> {
  await db().from("days").update({ [column]: null }).eq("id", dayId);
}

/** Keeps the stored timezone following TP's primary calendar. */
async function refreshTimezone(settings: Settings): Promise<string> {
  const google = await getGoogleAccount();
  if (!google) return settings.timezone;

  try {
    const { timezone: tz } = await primaryCalendar(decrypt(google.refresh_token));
    if (!tz || !isValidTimezone(tz) || tz === settings.timezone) return settings.timezone;

    await Promise.all([
      db().from("settings").update({ timezone: tz }).eq("singleton", true),
      db().from("google_accounts").update({ timezone: tz }).eq("singleton", true),
    ]);
    return tz;
  } catch {
    // A calendar outage should not stop the brief; keep the last known zone.
    return settings.timezone;
  }
}

/**
 * Refreshes the local cache of every active workspace.
 *
 * Runs on every tick, not only when the brief fires. The Now view reads the
 * cache, and until webhooks land in Phase 2 this is the only thing keeping it
 * honest — without it the cache is empty until the first brief of the day, and
 * picking a needle mover by hand before then finds nothing to rank.
 */
async function runSyncStep(log: string[]): Promise<void> {
  const results = await syncAll();
  if (results.length === 0) {
    log.push("sync: no active workspaces");
    return;
  }

  const failed = results.filter((r) => r.error);
  const issues = results.reduce((n, r) => n + r.issues, 0);
  const targeted = results.reduce((n, r) => n + r.targetedProjects, 0);

  log.push(
    `sync: ${results.length - failed.length}/${results.length} workspaces, ` +
      `${issues} issues, ${targeted} targeted project(s)`,
  );
  for (const f of failed) log.push(`sync failed for ${f.ventureName}: ${f.error}`);
}

async function runBriefStep(day: Day, settings: Settings, now: Date, log: string[]): Promise<void> {
  if (day.brief_sent_at) {
    log.push("brief: already sent");
    return;
  }

  if (settings.weekdays_only && isWeekend(day.date, settings.timezone)) {
    log.push("brief: skipped, weekend");
    return;
  }

  // Held off deliberately. Compared as plain local dates, inclusive.
  if (settings.paused_until && day.date <= settings.paused_until) {
    log.push(`brief: paused until ${settings.paused_until}`);
    return;
  }

  const briefTime = settings.brief_time.slice(0, 5);
  if (!hasPassed(now, briefTime, settings.timezone)) {
    log.push(`brief: not yet (${localTime(now, settings.timezone)} < ${briefTime})`);
    return;
  }

  if (!(await claim(day.id, "brief_sent_at"))) {
    log.push("brief: claimed by another tick");
    return;
  }

  try {
    const plan = await planDay(now);
    if (plan.status === "no-candidates") {
      // Nothing to pick is a real state, not an error. Release so a later tick
      // retries once a sync brings something in.
      await release(day.id, "brief_sent_at");
      log.push("brief: no candidates, nothing sent");
      return;
    }

    await sendBrief(settings.email, await briefProps(plan.day, settings));
    log.push(`brief: sent${plan.repairs.length ? ` (repaired: ${plan.repairs.join("; ")})` : ""}`);
  } catch (err) {
    await release(day.id, "brief_sent_at");
    throw err;
  }
}

async function briefProps(day: Day, settings: Settings) {
  const issue = unwrap(
    await db().from("issues").select("*").eq("id", day.needle_mover_id!).single(),
  ) as Issue;

  const workspace = unwrap(
    await db().from("workspaces").select("*").eq("id", issue.workspace_id).single(),
  ) as Workspace;

  const project = issue.project_id
    ? ((await db().from("projects").select("*").eq("id", issue.project_id).maybeSingle()).data as Project | null)
    : null;

  const { count } = await db()
    .from("captures")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");

  const carryOver = await carryOverMap(day.date);
  const carryOverDays = carryOver[issue.id] ?? 0;

  const focusWindow =
    day.focus_window_start && day.focus_window_end
      ? `${localTime(new Date(day.focus_window_start), settings.timezone)}–${localTime(new Date(day.focus_window_end), settings.timezone)}`
      : null;

  return {
    date: day.date,
    ventureName: workspace.venture_name,
    identifier: issue.identifier,
    title: issue.title,
    issueUrl: issue.url,
    projectName: project?.name ?? null,
    projectTarget: project?.target_date ?? null,
    reason: day.reason ?? "",
    firstStep: day.first_step ?? "",
    focusWindow,
    inboxCount: count ?? 0,
    carryOverDays,
    needsSplit: needsSplitPrompt(carryOverDays),
    degraded: day.degraded_scoring,
    appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  };
}

/**
 * One browser notification, halfway between the brief and the cutoff.
 *
 * Skipped once the task is done — the spec is explicit that a nudge about
 * finished work is worse than no nudge. Also skipped after the cutoff, so a
 * tick that runs late does not fire a "still on it?" at nine in the evening.
 */
async function runNudgeStep(
  day: Day,
  settings: Settings,
  now: Date,
  log: string[],
): Promise<void> {
  if (day.nudge_sent_at) {
    log.push("nudge: already sent");
    return;
  }
  if (!day.needle_mover_id || day.status === "closed") {
    log.push("nudge: nothing in progress");
    return;
  }

  const midday = middayTime(settings.brief_time, settings.close_cutoff_time);
  if (!hasPassed(now, midday, settings.timezone)) {
    log.push(`nudge: not yet (${localTime(now, settings.timezone)} < ${midday})`);
    return;
  }
  if (hasPassed(now, settings.close_cutoff_time.slice(0, 5), settings.timezone)) {
    log.push("nudge: past the cutoff, skipped");
    return;
  }

  const events = ((await db().from("day_events").select("*").eq("day_id", day.id)).data ??
    []) as DayEvent[];
  const state = nowState(day, events);
  if (state.done) {
    log.push("nudge: task already done");
    return;
  }

  if (!(await claim(day.id, "nudge_sent_at"))) {
    log.push("nudge: claimed by another tick");
    return;
  }

  try {
    const { data } = await db()
      .from("issues")
      .select("title")
      .eq("id", state.activeIssueId ?? day.needle_mover_id)
      .maybeSingle();
    const title = (data as { title: string } | null)?.title ?? "your needle mover";

    const result = await pushToAll({
      title: "Still on it?",
      body: title,
      url: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
    });

    if (result.sent === 0) {
      // Nothing was delivered, so nothing was nudged. Release the claim rather
      // than recording a nudge that never happened.
      await release(day.id, "nudge_sent_at");
      log.push(
        `nudge: no subscriptions${result.removed ? `, ${result.removed} expired and removed` : ""}`,
      );
      return;
    }

    log.push(
      `nudge: sent to ${result.sent}${result.removed ? `, ${result.removed} expired` : ""}${
        result.failed ? `, ${result.failed} failed` : ""
      }`,
    );
  } catch (err) {
    await release(day.id, "nudge_sent_at");
    throw err;
  }
}

/**
 * One nudge after the cutoff if the day is still open. Skipped entirely when
 * there was no needle mover to begin with — there is nothing to close.
 */
async function runCloseReminderStep(
  day: Day,
  settings: Settings,
  now: Date,
  log: string[],
): Promise<void> {
  if (day.reminder_sent_at) {
    log.push("reminder: already sent");
    return;
  }
  if (day.status === "closed") {
    log.push("reminder: day already closed");
    return;
  }
  if (!day.needle_mover_id) {
    log.push("reminder: nothing was picked today");
    return;
  }

  const cutoff = settings.close_cutoff_time.slice(0, 5);
  if (!hasPassed(now, cutoff, settings.timezone)) {
    log.push(`reminder: not yet (${localTime(now, settings.timezone)} < ${cutoff})`);
    return;
  }

  if (!(await claim(day.id, "reminder_sent_at"))) {
    log.push("reminder: claimed by another tick");
    return;
  }

  try {
    await sendCloseReminder(
      settings.email,
      process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
    );
    log.push("reminder: sent");
  } catch (err) {
    await release(day.id, "reminder_sent_at");
    throw err;
  }
}

export async function POST(request: Request) {
  const secret = process.env.TICK_SECRET;
  const presented =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    request.headers.get("x-tick-secret") ??
    "";

  if (!secret || !safeEqual(presented, secret)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const log: string[] = [];
  const now = new Date();

  try {
    const settings = await getSettings();
    const timezone = await refreshTimezone(settings);
    if (timezone !== settings.timezone) log.push(`timezone: now ${timezone}`);

    const current = { ...settings, timezone };
    const today = localDate(now, timezone);
    const day = await materializeDay(today, timezone);

    await runSyncStep(log);
    await runBriefStep(day, current, now, log);

    // Re-read: the brief step may have just planned the day, and the reminder
    // needs to see that rather than the row as it was before.
    const after = await materializeDay(today, timezone);
    await runNudgeStep(after, current, now, log);
    await runCloseReminderStep(after, current, now, log);

    return Response.json({ ok: true, at: now.toISOString(), timezone, date: today, log });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.push(`error: ${message}`);
    return Response.json({ ok: false, at: now.toISOString(), log }, { status: 500 });
  }
}
