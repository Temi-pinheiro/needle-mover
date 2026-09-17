-- The recap appears in the app as well as in the inbox, so the narrative has
-- to outlive the email. Without this the app would have to re-ask Claude to
-- redisplay something already written, and the two copies could disagree.
alter table days add column if not exists recap_summary text;
alter table days add column if not exists recap_tomorrow_note text;
alter table days add column if not exists recap_tomorrow_id uuid references issues(id) on delete set null;
