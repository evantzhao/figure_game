-- Run explicitly on the intended hosted database after migrations, as its administrator.
-- Kept outside migrations: local/disposable Postgres does not need pg_cron installed.
CREATE EXTENSION IF NOT EXISTS pg_cron;
SELECT cron.schedule('chinese-chess-casual-timeouts', '* * * * *',
  'SELECT chess_private.settle_casual_timeouts()');
-- Verify: SELECT jobname,schedule,active FROM cron.job WHERE jobname='chinese-chess-casual-timeouts';
-- Inspect runs: SELECT status,return_message,start_time FROM cron.job_run_details
-- WHERE jobid=(SELECT jobid FROM cron.job WHERE jobname='chinese-chess-casual-timeouts') ORDER BY start_time DESC LIMIT 5;
-- Rollback scheduler only: SELECT cron.unschedule('chinese-chess-casual-timeouts');
