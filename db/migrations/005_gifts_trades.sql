-- Migration 005 — phase 7 (boutique, inventaire, entraide).
-- Medicine gifts sent to a friend's creature and accessory trades between friends.
-- Idempotent : à coller dans Neon → SQL Editor.

CREATE TABLE IF NOT EXISTS gifts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  to_user_id   text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  creature_id  uuid REFERENCES creatures(id) ON DELETE SET NULL,
  item         text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  seen_at      timestamptz,
  CONSTRAINT gifts_not_self_check CHECK (from_user_id <> to_user_id)
);
CREATE INDEX IF NOT EXISTS gifts_to_user_created_idx ON gifts (to_user_id, created_at);

CREATE TABLE IF NOT EXISTS trades (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposer_id            text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  receiver_id            text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  offered_accessory_id   text NOT NULL,
  requested_accessory_id text NOT NULL,
  status                 text NOT NULL DEFAULT 'pending',
  created_at             timestamptz NOT NULL DEFAULT now(),
  resolved_at            timestamptz,
  CONSTRAINT trades_not_self_check CHECK (proposer_id <> receiver_id),
  CONSTRAINT trades_status_check CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled'))
);
CREATE INDEX IF NOT EXISTS trades_receiver_status_idx ON trades (receiver_id, status);
CREATE INDEX IF NOT EXISTS trades_proposer_status_idx ON trades (proposer_id, status);
