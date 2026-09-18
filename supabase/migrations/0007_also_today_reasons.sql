-- "Also today" items now carry a one-line reason, so finishing the needle
-- mover early lands on a short list you already trust rather than sending you
-- back to Linear to re-decide.
--
-- Kept as a map beside the existing ordered id array rather than replacing it:
-- the order is the ranking and belongs in an array, the reasons are lookups.
alter table days
  add column if not exists also_today_reasons jsonb not null default '{}'::jsonb;

comment on column days.also_today_reasons is
  'issue id -> one-line reason this is worth touching today.';
