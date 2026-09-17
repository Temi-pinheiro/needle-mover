-- Lets the brief be held off until a given date — while a backlog is being
-- restructured, over a holiday, or before the first real run.
--
-- Deliberately not done by pre-setting days.brief_sent_at: that column means
-- "this brief was sent", and writing it when nothing was sent puts a small
-- falsehood into the record the recap reads from.
alter table settings add column if not exists paused_until date;

comment on column settings.paused_until is
  'Hold the morning brief through this local date, inclusive. Null means never paused.';
