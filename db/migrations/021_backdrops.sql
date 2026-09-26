-- Migration 021 — Fonds de scène : un fond par design, dix fonds à trouver dans les coffres, choix par créature depuis la garde-robe.
-- Idempotent : à coller dans Neon → SQL Editor.

ALTER TABLE creatures ADD COLUMN IF NOT EXISTS backdrop text;

CREATE TABLE IF NOT EXISTS user_backdrops (
  user_id     text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  backdrop_id text NOT NULL,
  obtained_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, backdrop_id)
);
