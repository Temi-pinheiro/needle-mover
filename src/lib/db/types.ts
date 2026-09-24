/**
 * Row types for the tables in supabase/migrations/0001_init.sql.
 *
 * Hand-written for now. Once the Supabase project exists, `pnpm db:types`
 * generates the real ones and these become the fallback.
 */

export type Settings = {
  singleton: true;
  email: string;
  timezone: string;
  updated_at: string;
};

export type Workspace = {
  id: string;
  venture_name: string;
  linear_org_id: string | null;
  linear_team_id: string | null;
  linear_team_key: string | null;
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
  /** Linear: 0 none, 1 urgent .. 4 low. Null before 0009 or before a sync. */
  priority: number | null;
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
  also_today_ids: string[];
  also_today_reasons: Record<string, string>;
  reason: string | null;
  first_step: string | null;
  plain_focus: string | null;
  degraded_scoring: boolean;
  status: DayStatus;
  closed_at: string | null;
  recap_summary: string | null;
  recap_tomorrow_note: string | null;
  recap_tomorrow_id: string | null;
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

export type CaptureSource = "text" | "voice";
export type CaptureStatus = "pending" | "approved" | "discarded";

/**
 * What Claude proposed, after deterministic repair, and after any edits made
 * in the inbox. Ids are ours, not Linear's: they are checked against the cache
 * so a proposal can never name a venture or project that does not exist.
 */
export type ProposedIssue = {
  title: string;
  workspace_id: string | null;
  project_id: string | null;
  due_date: string | null;
  description: string | null;
};

export type Capture = {
  id: string;
  source: CaptureSource;
  raw_text: string | null;
  audio_path: string | null;
  proposed_issue: ProposedIssue | null;
  status: CaptureStatus;
  linear_issue_id: string | null;
  created_at: string;
  resolved_at: string | null;
};
