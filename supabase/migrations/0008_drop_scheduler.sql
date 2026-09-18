-- Removing the scheduler, the calendar, browser push and outbound email.
--
-- The reasoning, recorded because the columns going away look useful in
-- isolation: every one of them existed to support something the app no longer
-- does. The *_sent_at timestamps existed only so a cron could not double-send.
-- The focus window existed to suggest when to work, which is the app deciding
-- something it was never entitled to decide. google_accounts and
-- push_subscriptions have no remaining reader.
--
-- days.backup_id goes with the same logic: with three ranked tasks under the
-- needle mover, a blocked task is answered by doing the next one.

alter table days drop column if exists brief_sent_at;
alter table days drop column if exists nudge_sent_at;
alter table days drop column if exists reminder_sent_at;
alter table days drop column if exists recap_sent_at;
alter table days drop column if exists focus_window_start;
alter table days drop column if exists focus_window_end;
alter table days drop column if exists backup_id;

alter table settings drop column if exists brief_time;
alter table settings drop column if exists close_cutoff_time;
alter table settings drop column if exists weekdays_only;
alter table settings drop column if exists paused_until;

drop table if exists push_subscriptions;
drop table if exists google_accounts;
