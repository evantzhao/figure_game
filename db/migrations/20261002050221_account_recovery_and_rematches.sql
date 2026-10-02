-- Additive upgrade: existing accounts, cookies, saved games and clients remain valid.
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS recovery_hash text;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE games ADD COLUMN IF NOT EXISTS rematch_by uuid REFERENCES accounts(id);
ALTER TABLE games ADD COLUMN IF NOT EXISTS rematch_id uuid REFERENCES games(id);
CREATE UNIQUE INDEX IF NOT EXISTS one_rematch_game ON games(rematch_id) WHERE rematch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS casual_game_deadlines ON games
 ((turn_started + CASE WHEN state->'position'->>'turn'='red' THEN red_ms ELSE black_ms END))
 WHERE status='active' AND NOT rated;

-- Private, invoker-only function for a database-owned Cron job. No browser RPC exposure.
CREATE SCHEMA IF NOT EXISTS chess_private;
REVOKE ALL ON SCHEMA chess_private FROM PUBLIC;
CREATE OR REPLACE FUNCTION chess_private.settle_casual_timeouts() RETURNS integer
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE g public.games%ROWTYPE; settled integer := 0; now_ms double precision;
BEGIN
  now_ms := EXTRACT(EPOCH FROM clock_timestamp())*1000;
  FOR g IN
    SELECT * FROM public.games
    WHERE NOT rated AND (
      (status='waiting' AND created_at <= clock_timestamp()-interval '30 minutes') OR
      (status='active' AND turn_started + CASE WHEN state->'position'->>'turn'='red' THEN red_ms ELSE black_ms END <= now_ms))
    ORDER BY created_at LIMIT 100 FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.games SET
      status=CASE WHEN g.status='waiting' THEN 'aborted' ELSE 'finished' END,
      winner=CASE WHEN g.status='waiting' THEN NULL WHEN g.state->'position'->>'turn'='red' THEN 'black' ELSE 'red' END,
      reason=CASE WHEN g.status='waiting' THEN 'expired' ELSE 'timeout' END,
      draw_by=NULL, version=version+1, updated_at=clock_timestamp()
    WHERE id=g.id;
    DELETE FROM public.active_players WHERE game_id=g.id;
    settled := settled+1;
  END LOOP;
  RETURN settled;
END;
$$;
REVOKE ALL ON FUNCTION chess_private.settle_casual_timeouts() FROM PUBLIC;
INSERT INTO schema_migrations(version) VALUES('20261002050221') ON CONFLICT DO NOTHING;
