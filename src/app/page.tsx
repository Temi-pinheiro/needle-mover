import { db } from "@/lib/db/client";
import type { DayEvent, Issue, Project, Workspace } from "@/lib/db/types";
import { carryOverMap, getSettings, materializeDay } from "@/lib/day";
import { nowState } from "@/lib/day-state";
import { needsSplitPrompt } from "@/lib/scoring/score";
import { localDate, localTime } from "@/lib/time";
import { planToday } from "./actions";
import { NowView, type TaskCard } from "@/components/NowView";
import { DayClosed } from "@/components/DayClosed";
import { Notice } from "@/components/Notice";

export const dynamic = "force-dynamic";

export default async function Page() {
  let settings;
  try {
    settings = await getSettings();
  } catch {
    return (
      <Notice
        eyebrow="Not set up yet"
        title="Needle Mover has no settings row."
        body="Apply the migrations in supabase/migrations, then insert your settings row with your email, brief time and close-day cutoff. Once a Linear workspace and Google Calendar are connected, the first brief will arrive on schedule."
      />
    );
  }

  const now = new Date();
  const today = localDate(now, settings.timezone);
  const day = await materializeDay(today, settings.timezone);

  const workspaces = ((await db().from("workspaces").select("*").eq("active", true)).data ??
    []) as Workspace[];

  if (workspaces.length === 0) {
    return (
      <Notice
        eyebrow="No ventures connected"
        title="Nothing to rank yet."
        body="Add a Linear workspace with a personal API key and its venture name. Run pnpm linear:check first to confirm the key works and to see how many of your issues sit in a project with a target date."
      />
    );
  }

  if (!day.needle_mover_id) {
    return (
      <Notice
        eyebrow={today}
        title="Today has not been picked yet."
        body="The morning brief runs on a schedule, but you can pull it forward. This syncs every connected workspace, scores what is open, and asks Claude to choose."
        action={{ label: "Pick today’s needle mover", run: planToday }}
      />
    );
  }

  // A closed day shows the recap, read from the row rather than regenerated,
  // so the page and the email can never disagree.
  if (day.status === "closed") {
    const { closedToday, projectMovements } = await import("@/lib/recap");
    const [closed, movements] = await Promise.all([
      closedToday(day.date, settings.timezone, workspaces),
      projectMovements(day.date),
    ]);

    const tomorrowIssue = day.recap_tomorrow_id
      ? ((await db().from("issues").select("*").eq("id", day.recap_tomorrow_id).maybeSingle())
          .data as Issue | null)
      : null;

    return (
      <DayClosed
        date={today}
        summary={day.recap_summary}
        closed={closed}
        movements={movements}
        tomorrow={
          tomorrowIssue
            ? {
                identifier: tomorrowIssue.identifier,
                title: tomorrowIssue.title,
                ventureName:
                  workspaces.find((w) => w.id === tomorrowIssue.workspace_id)?.venture_name ??
                  "Unknown",
              }
            : null
        }
        tomorrowNote={day.recap_tomorrow_note}
        recapWasSent={Boolean(day.recap_sent_at)}
      />
    );
  }

  const events = ((await db().from("day_events").select("*").eq("day_id", day.id)).data ??
    []) as DayEvent[];
  const state = nowState(day, events);

  const ids = [state.activeIssueId, ...day.also_today_ids].filter(
    (id): id is string => typeof id === "string",
  );
  const issues = ((await db().from("issues").select("*").in("id", ids)).data ?? []) as Issue[];
  const projects = ((await db().from("projects").select("*")).data ?? []) as Project[];

  const projectById = new Map(projects.map((p) => [p.id, p]));
  const ventureById = new Map(workspaces.map((w) => [w.id, w.venture_name]));

  const toCard = (issue: Issue): TaskCard => {
    const project = issue.project_id ? projectById.get(issue.project_id) : null;
    return {
      id: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      url: issue.url,
      ventureName: ventureById.get(issue.workspace_id) ?? "Unknown",
      projectName: project?.name ?? null,
      projectTarget: project?.target_date ?? null,
      projectProgress: project ? project.progress : null,
    };
  };

  const active = issues.find((i) => i.id === state.activeIssueId);
  if (!active) {
    return (
      <Notice
        eyebrow={today}
        title="Today’s task is no longer in the cache."
        body="It was probably closed or reassigned in Linear since the brief went out. Picking again will choose from what is currently open."
        action={{ label: "Pick again", run: planToday }}
      />
    );
  }

  const carryOver = await carryOverMap(today);
  const carryOverDays = day.needle_mover_id ? (carryOver[day.needle_mover_id] ?? 0) : 0;

  const focusWindow =
    day.focus_window_start && day.focus_window_end
      ? `Focus window ${localTime(new Date(day.focus_window_start), settings.timezone)}–${localTime(
          new Date(day.focus_window_end),
          settings.timezone,
        )}`
      : null;

  return (
    <NowView
      dayId={day.id}
      date={today}
      active={toCard(active)}
      showingBackup={state.showingBackup}
      blockReason={state.blockReason}
      started={state.started}
      done={state.done}
      firstStep={day.first_step ?? ""}
      reason={day.reason ?? ""}
      focusWindow={focusWindow}
      carryOverDays={carryOverDays}
      needsSplit={needsSplitPrompt(carryOverDays)}
      degraded={day.degraded_scoring}
      alsoToday={day.also_today_ids
        .map((id) => issues.find((i) => i.id === id))
        .filter((i): i is Issue => Boolean(i))
        .map(toCard)}
    />
  );
}
