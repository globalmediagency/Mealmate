-- Migration 009 — pension : une créature confiée à un ami pour 30 jours au plus.
-- While a row is open (ended_at IS NULL) the host holds the creature: their
-- meals, steps, games and medicine apply to it and its chests are theirs.
-- Idempotent : à coller dans Neon → SQL Editor.

CREATE TABLE IF NOT EXISTS boardings (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creature_id  uuid NOT NULL REFERENCES creatures(id) ON DELETE CASCADE,
  owner_id     text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  host_id      text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  started_at   timestamptz NOT NULL DEFAULT now(),
  ends_at      timestamptz NOT NULL,
  ended_at     timestamptz,
  end_reason   text,
  host_seen_at timestamptz,
  CONSTRAINT boardings_not_self_check CHECK (owner_id <> host_id),
  CONSTRAINT boardings_end_reason_check CHECK (end_reason IS NULL OR end_reason IN ('recovered', 'returned', 'expired', 'died'))
);
CREATE INDEX IF NOT EXISTS boardings_host_idx ON boardings (host_id, ended_at);
CREATE INDEX IF NOT EXISTS boardings_owner_idx ON boardings (owner_id, ended_at);
CREATE UNIQUE INDEX IF NOT EXISTS boardings_creature_open_idx ON boardings (creature_id) WHERE ended_at IS NULL;
