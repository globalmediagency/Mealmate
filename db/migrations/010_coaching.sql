-- Migration 010 — coaching : un ami devient le coach d'un joueur, voit ses repas
-- et les note d'un pouce ; les pouces donnent des accessoires surprise.
-- Idempotent : à coller dans Neon → SQL Editor.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS student_rewards_opened integer NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS coach_rewards_opened integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS coachings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id      text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  coach_id        text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  status          text NOT NULL DEFAULT 'pending',
  created_at      timestamptz NOT NULL DEFAULT now(),
  responded_at    timestamptz,
  ended_at        timestamptz,
  ended_by        text,
  thumbs_up       integer NOT NULL DEFAULT 0,
  thumbs_down     integer NOT NULL DEFAULT 0,
  student_seen_at timestamptz,
  CONSTRAINT coachings_not_self_check CHECK (student_id <> coach_id),
  CONSTRAINT coachings_status_check CHECK (status IN ('pending', 'active', 'declined', 'cancelled', 'ended'))
);
CREATE INDEX IF NOT EXISTS coachings_coach_status_idx ON coachings (coach_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS coachings_student_open_idx ON coachings (student_id) WHERE status IN ('pending', 'active');

CREATE TABLE IF NOT EXISTS meal_reviews (
  meal_id     uuid PRIMARY KEY REFERENCES meals(id) ON DELETE CASCADE,
  coaching_id uuid NOT NULL REFERENCES coachings(id) ON DELETE CASCADE,
  verdict     text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT meal_reviews_verdict_check CHECK (verdict IN ('up', 'down'))
);
CREATE INDEX IF NOT EXISTS meal_reviews_coaching_idx ON meal_reviews (coaching_id);
