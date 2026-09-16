/**
 * Row types for the tables in supabase/migrations/0001_init.sql.
 *
 * Hand-written for now. Once the Supabase project exists, `pnpm db:types`
 * generates the real ones and these become the fallback.
 */

export type Settings = {
  singleton: true;
  email: string;
  brief_time: string;
  close_cutoff_time: string;
  timezone: string;
  weekdays_only: boolean;
  updated_at: string;
};

export type GoogleAccount = {
  singleton: true;
  email: string;
  refresh_token: string;
  primary_calendar_id: string;
  timezone: string | null;
  connected_at: string;
};

export type Workspace = {
  id: string;
  venture_name: string;
  linear_org_id: string | null;
  api_key: string;
  webhook_secret: string | null;
  active: boolean;
  is_private: boolean;
  last_synced_at: string | null;
  created_at: string;
};

export type Project = {
  id: string;
  linear_project_id: string;
  workspace_id: string;
  name: string;
  target_date: string | null;
  progress: number;
  state: string | null;
  scope_estimate: number | null;
  synced_at: string;
};

export type Issue = {
  id: string;
  linear_issue_id: string;
  workspace_id: string;
  project_id: string | null;
  identifier: string;
  title: string;
  url: string | null;
  state: string;
  state_type: string;
  priority: number;
  estimate: number | null;
  due_date: string | null;
  blocks_count: number;
  is_blocked: boolean;
  linear_updated_at: string | null;
  synced_at: string;
};

export type DayStatus = "open" | "closed";

export type Day = {
  id: string;
  date: string;
  timezone: string;
  needle_mover_id: string | null;
  backup_id: string | null;
  also_today_ids: string[];
  reason: string | null;
  first_step: string | null;
  plain_focus: string | null;
  focus_window_start: string | null;
  focus_window_end: string | null;
  degraded_scoring: boolean;
  status: DayStatus;
  closed_at: string | null;
  brief_sent_at: string | null;
  nudge_sent_at: string | null;
  reminder_sent_at: string | null;
  recap_sent_at: string | null;
  created_at: string;
};

export type DayEventType = "started" | "blocked" | "swapped" | "done" | "nudged";

export type DayEvent = {
  id: string;
  day_id: string;
  type: DayEventType;
  issue_id: string | null;
  related_issue_id: string | null;
  note: string | null;
  created_at: string;
};

export type ProgressSnapshot = {
  id: string;
  project_id: string;
  date: string;
  moment: "open" | "close";
  progress: number;
  created_at: string;
};
