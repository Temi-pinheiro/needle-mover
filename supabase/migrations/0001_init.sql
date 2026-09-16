-- Needle Mover: initial schema.
-- Linear is the source of truth for tasks; `projects` and `issues` are caches
-- rebuilt by sync so scoring can run against local data in one query.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- settings --
-- Exactly one row, pinned by the `singleton` primary key.
create table settings (
  singleton            boolean primary key default true check (singleton),
  email                text        not null,
  brief_time           time        not null default '07:00',
  close_cutoff_time    time        not null default '19:00',
  timezone             text        not null default 'UTC',
  weekdays_only        boolean     not null default true,
  updated_at           timestamptz not null default now()
);

-- -------------------------------------------------------- google_accounts --
-- Calendar access is its own OAuth grant, separate from sign-in, so a lost
-- provider token never costs us the refresh token.
create table google_accounts (
  singleton            boolean primary key default true check (singleton),
  email                text        not null,
  refresh_token        text        not null,   -- AES-256-GCM, see lib/crypto
  primary_calendar_id  text        not null default 'primary',
  timezone             text,                   -- mirrored into settings each tick
  connected_at         timestamptz not null default now()
);

-- ------------------------------------------------------------- workspaces --
create table workspaces (
  id             uuid primary key default gen_random_uuid(),
  venture_name   text        not null,
  linear_org_id  text,
  api_key        text        not null,         -- AES-256-GCM, see lib/crypto
  webhook_secret text,
  active         boolean     not null default true,
  is_private     boolean     not null default false,
  last_synced_at timestamptz,
  created_at     timestamptz not null default now()
);

-- --------------------------------------------------------------- projects --
create table projects (
  id                uuid primary key default gen_random_uuid(),
  linear_project_id text        not null unique,
  workspace_id      uuid        not null references workspaces(id) on delete cascade,
  name              text        not null,
  target_date       date,
  progress          numeric(5,4) not null default 0,   -- 0..1, as Linear reports it
  state             text,
  scope_estimate    numeric,     -- sum of estimates on the project, for scope share
  synced_at         timestamptz not null default now()
);
create index projects_workspace_idx on projects (workspace_id);

-- ----------------------------------------------------------------- issues --
create table issues (
  id                uuid primary key default gen_random_uuid(),
  linear_issue_id   text        not null unique,
  workspace_id      uuid        not null references workspaces(id) on delete cascade,
  project_id        uuid        references projects(id) on delete set null,
  identifier        text        not null,      -- e.g. MEN-214
  title             text        not null,
  url               text,
  state             text        not null,
  state_type        text        not null,      -- backlog|unstarted|started|completed|canceled
  priority          int         not null default 0,   -- Linear: 0 none .. 1 urgent
  estimate          numeric,
  due_date          date,
  blocks_count      int         not null default 0,
  is_blocked        boolean     not null default false,
  linear_updated_at timestamptz,
  synced_at         timestamptz not null default now()
);
create index issues_workspace_idx on issues (workspace_id);
create index issues_project_idx   on issues (project_id);
create index issues_open_idx      on issues (state_type) where state_type not in ('completed','canceled');

-- ------------------------------------------------------------------- days --
-- One row per local date. The `*_sent_at` columns are what make /api/tick
-- idempotent: every scheduled step claims its column before it sends.
create table days (
  id                  uuid primary key default gen_random_uuid(),
  date                date        not null unique,
  timezone            text        not null,
  needle_mover_id     uuid        references issues(id) on delete set null,
  backup_id           uuid        references issues(id) on delete set null,
  also_today_ids      uuid[]      not null default '{}',
  reason              text,
  first_step          text,
  plain_focus         text,
  focus_window_start  timestamptz,
  focus_window_end    timestamptz,
  degraded_scoring    boolean     not null default false,  -- goal leverage was renormalised away
  status              text        not null default 'open' check (status in ('open','closed')),
  closed_at           timestamptz,
  brief_sent_at       timestamptz,
  nudge_sent_at       timestamptz,
  reminder_sent_at    timestamptz,
  recap_sent_at       timestamptz,
  created_at          timestamptz not null default now()
);

-- ------------------------------------------------------------- day_events --
-- The day's audit trail. `related_issue_id` carries the swap target, which is
-- the signal Phase 5 needs to tune weights.
create table day_events (
  id                uuid primary key default gen_random_uuid(),
  day_id            uuid        not null references days(id) on delete cascade,
  type              text        not null check (type in ('started','blocked','swapped','done','nudged')),
  issue_id          uuid        references issues(id) on delete set null,
  related_issue_id  uuid        references issues(id) on delete set null,
  note              text,
  created_at        timestamptz not null default now()
);
create index day_events_day_idx on day_events (day_id, created_at);

-- ------------------------------------------------------ progress_snapshots --
create table progress_snapshots (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid        not null references projects(id) on delete cascade,
  date       date        not null,
  moment     text        not null check (moment in ('open','close')),
  progress   numeric(5,4) not null,
  created_at timestamptz not null default now(),
  unique (project_id, date, moment)
);

-- --------------------------------------------------------------- captures --
create table captures (
  id              uuid primary key default gen_random_uuid(),
  source          text        not null check (source in ('text','voice')),
  raw_text        text,
  audio_path      text,       -- Supabase Storage key, cleared after approval
  proposed_issue  jsonb,
  status          text        not null default 'pending' check (status in ('pending','approved','discarded')),
  linear_issue_id text,
  created_at      timestamptz not null default now(),
  resolved_at     timestamptz
);
create index captures_pending_idx on captures (created_at) where status = 'pending';

-- ------------------------------------------------------------ share_links --
create table share_links (
  id             uuid primary key default gen_random_uuid(),
  token          text        not null unique,
  type           text        not null check (type in ('collaborator','personal')),
  workspace_id   uuid        references workspaces(id) on delete cascade,
  label          text,
  expires_at     timestamptz,
  revoked_at     timestamptz,
  view_count     int         not null default 0,
  last_viewed_at timestamptz,
  created_at     timestamptz not null default now(),
  -- a collaborator link is scoped to exactly one venture; a personal link to none
  check ((type = 'collaborator') = (workspace_id is not null))
);

-- ---------------------------------------------------- push_subscriptions --
create table push_subscriptions (
  endpoint   text primary key,
  p256dh     text        not null,
  auth       text        not null,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------------- RLS --
-- Single user. Every read path that matters runs server-side under the service
-- role; RLS is the backstop that keeps the anon key from reading anything,
-- including on the unauthenticated guest-link pages.
alter table settings           enable row level security;
alter table google_accounts    enable row level security;
alter table workspaces         enable row level security;
alter table projects           enable row level security;
alter table issues             enable row level security;
alter table days               enable row level security;
alter table day_events         enable row level security;
alter table progress_snapshots enable row level security;
alter table captures           enable row level security;
alter table share_links        enable row level security;
alter table push_subscriptions enable row level security;
