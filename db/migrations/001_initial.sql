CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS accounts (
 id uuid PRIMARY KEY, username text UNIQUE NOT NULL CHECK (username ~ '^[a-z0-9_]{3,20}$'),
 password_hash text NOT NULL, rating integer NOT NULL DEFAULT 1500, rated_games integer NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sessions (token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE, expires_at timestamptz NOT NULL);
CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS games (
 id uuid PRIMARY KEY, red_id uuid NOT NULL REFERENCES accounts(id), black_id uuid REFERENCES accounts(id),
 status text NOT NULL CHECK (status IN ('waiting','active','finished','review','aborted')),
 state jsonb NOT NULL, version integer NOT NULL DEFAULT 0, red_ms integer NOT NULL DEFAULT 600000,
 black_ms integer NOT NULL DEFAULT 600000, turn_started double precision, draw_by uuid,
 winner text CHECK(winner IN ('red','black')), reason text, rated boolean NOT NULL DEFAULT false,
 ruleset text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK (red_id IS DISTINCT FROM black_id)
);
CREATE INDEX IF NOT EXISTS games_red_history ON games(red_id, created_at DESC);
CREATE INDEX IF NOT EXISTS games_black_history ON games(black_id, created_at DESC);
CREATE INDEX IF NOT EXISTS games_active ON games(status, turn_started);
CREATE TABLE IF NOT EXISTS active_players (user_id uuid PRIMARY KEY REFERENCES accounts(id), game_id uuid NOT NULL REFERENCES games(id));
CREATE TABLE IF NOT EXISTS moves (game_id uuid NOT NULL REFERENCES games(id), ply integer NOT NULL, actor_id uuid NOT NULL REFERENCES accounts(id), move text NOT NULL, fen text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(game_id,ply));
CREATE TABLE IF NOT EXISTS commands (user_id uuid NOT NULL REFERENCES accounts(id), command_id uuid NOT NULL, payload_hash text NOT NULL, response jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,command_id));
CREATE TABLE IF NOT EXISTS rating_events (game_id uuid NOT NULL REFERENCES games(id), user_id uuid NOT NULL REFERENCES accounts(id), before_rating integer NOT NULL, after_rating integer NOT NULL, PRIMARY KEY(game_id,user_id));
CREATE TABLE IF NOT EXISTS queue_guard (id integer PRIMARY KEY CHECK (id=1));
INSERT INTO queue_guard(id) VALUES(1) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS queue_tickets (user_id uuid PRIMARY KEY REFERENCES accounts(id), created_ms double precision NOT NULL, heartbeat_ms double precision NOT NULL);
CREATE TABLE IF NOT EXISTS practice (id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES accounts(id), label text NOT NULL, moves jsonb NOT NULL, reason text, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS practice_history ON practice(user_id,created_at DESC);
CREATE TABLE IF NOT EXISTS rate_limits (key text PRIMARY KEY, window_start double precision NOT NULL, count integer NOT NULL);
-- Browser/public roles get no table access. All access is through authenticated server services.
REVOKE ALL ON accounts, sessions, games, active_players, moves, commands, rating_events, queue_guard, queue_tickets, practice, rate_limits FROM PUBLIC;
INSERT INTO schema_migrations(version) VALUES('001') ON CONFLICT DO NOTHING;
