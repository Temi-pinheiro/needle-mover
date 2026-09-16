-- Drives /api/tick every 15 minutes from the database, so the schedule costs
-- nothing and does not depend on a paid Vercel plan.
--
-- Before applying, set the two settings this reads. They live in Vault rather
-- than in this file so the secret is never committed:
--
--   select vault.create_secret('https://your-app.vercel.app', 'app_url');
--   select vault.create_secret('<TICK_SECRET>', 'tick_secret');

create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.call_tick()
returns void
language plpgsql
security definer
set search_path = public, extensions, vault
as $$
declare
  app_url text;
  tick_secret text;
begin
  select decrypted_secret into app_url from vault.decrypted_secrets where name = 'app_url';
  select decrypted_secret into tick_secret from vault.decrypted_secrets where name = 'tick_secret';

  if app_url is null or tick_secret is null then
    raise warning 'call_tick: app_url or tick_secret missing from vault, skipping';
    return;
  end if;

  -- Fire and forget. pg_net queues the request; the response lands in
  -- net._http_response, which is where to look when a brief does not arrive.
  perform net.http_post(
    url     := app_url || '/api/tick',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || tick_secret
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
end;
$$;

revoke all on function public.call_tick() from public, anon, authenticated;

select cron.schedule('needle-mover-tick', '*/15 * * * *', $$select public.call_tick()$$);

-- Useful when debugging a missed brief:
--   select * from cron.job_run_details where jobname = 'needle-mover-tick' order by start_time desc limit 20;
--   select id, status_code, content from net._http_response order by created desc limit 20;
