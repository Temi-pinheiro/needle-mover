-- A venture is a Linear TEAM, not a Linear organisation.
--
-- The original model assumed one organisation per venture. With two ventures
-- in one organisation, both synced the same issues, every row collided on
-- issues.linear_issue_id, and whichever sync finished last took them all —
-- so one venture silently showed zero work.
--
-- linear_team_id null means "the whole organisation", which stays correct for
-- a workspace that really is one venture.
alter table workspaces add column if not exists linear_team_id text;
alter table workspaces add column if not exists linear_team_key text;

comment on column workspaces.linear_team_id is
  'Scopes this venture to one Linear team. Null means the whole organisation.';
