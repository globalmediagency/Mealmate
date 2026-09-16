-- Migration 015 — « Arène » : bataille en réalité augmentée entre amis.
-- Parties (arena_matches), joueurs (arena_players), bons aliments posés sur la table
-- (arena_bonuses), journal des coups (arena_events) ; nouveau type de partie 'arena'.
-- Idempotent : à coller dans Neon → SQL Editor.

CREATE TABLE IF NOT EXISTS arena_matches (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id          text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  status           text NOT NULL DEFAULT 'lobby',
  max_hp           integer NOT NULL DEFAULT 100,
  egg_damage       integer NOT NULL DEFAULT 15,
  duration_seconds integer NOT NULL DEFAULT 180,
  started_at       timestamptz,
  ends_at          timestamptz,
  finished_at      timestamptz,
  next_bonus_at    timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT arena_matches_status_check CHECK (status IN ('lobby', 'playing', 'finished', 'cancelled'))
);
CREATE INDEX IF NOT EXISTS arena_matches_host_status_idx ON arena_matches (host_id, status);

CREATE TABLE IF NOT EXISTS arena_players (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id      uuid NOT NULL REFERENCES arena_matches(id) ON DELETE CASCADE,
  user_id       text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  creature_id   uuid NOT NULL REFERENCES creatures(id) ON DELETE CASCADE,
  marker        integer NOT NULL,
  status        text NOT NULL DEFAULT 'invited',
  hp            integer NOT NULL DEFAULT 100,
  hits_dealt    integer NOT NULL DEFAULT 0,
  hits_taken    integer NOT NULL DEFAULT 0,
  shots         integer NOT NULL DEFAULT 0,
  good_eaten    integer NOT NULL DEFAULT 0,
  healed        integer NOT NULL DEFAULT 0,
  rank          integer,
  eliminated_at timestamptz,
  last_shot_at  timestamptz,
  rewarded_at   timestamptz,
  reward        jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT arena_players_status_check CHECK (status IN ('invited', 'ready', 'declined', 'left'))
);
CREATE UNIQUE INDEX IF NOT EXISTS arena_players_match_user_idx ON arena_players (match_id, user_id);
CREATE INDEX IF NOT EXISTS arena_players_user_idx ON arena_players (user_id);

CREATE TABLE IF NOT EXISTS arena_bonuses (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id       uuid NOT NULL REFERENCES arena_matches(id) ON DELETE CASCADE,
  anchor_user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  kind           text NOT NULL,
  x              double precision NOT NULL,
  y              double precision NOT NULL,
  heal           integer NOT NULL,
  expires_at     timestamptz NOT NULL,
  eaten_by       text REFERENCES "user"(id) ON DELETE SET NULL,
  eaten_at       timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS arena_bonuses_match_expires_idx ON arena_bonuses (match_id, expires_at);

CREATE TABLE IF NOT EXISTS arena_events (
  id         bigserial PRIMARY KEY,
  match_id   uuid NOT NULL REFERENCES arena_matches(id) ON DELETE CASCADE,
  actor_id   text REFERENCES "user"(id) ON DELETE CASCADE,
  kind       text NOT NULL,
  payload    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS arena_events_match_id_idx ON arena_events (match_id, id);

ALTER TABLE play_sessions DROP CONSTRAINT IF EXISTS play_sessions_kind_check;
ALTER TABLE play_sessions ADD CONSTRAINT play_sessions_kind_check CHECK (kind IN ('catch', 'defense', 'arena'));
