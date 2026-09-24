-- Linear project priority, read into the cache so scoring can rank projects
-- by how much the founder says they matter.
--
-- Until now the only priority the scorer saw was the issue's. That compared
-- issue priorities across projects, so a minor project with every issue marked
-- Urgent outranked an Urgent project whose issues were marked sensibly. Project
-- priority now sets the tier; issue priority only orders within it.
--
-- Same scale as Linear: 0 none, 1 urgent, 2 high, 3 medium, 4 low. Null means
-- not synced yet, and scoring falls back to issue priority alone.
alter table projects add column if not exists priority int;

comment on column projects.priority is
  'Linear project priority: 0 none, 1 urgent .. 4 low. Null until synced.';
