-- Migration 017 — Mises de l'Arène : chaque joueur peut miser des accessoires avant la bataille ; le vainqueur remporte tout.
-- Table arena_stakes (un exemplaire par ligne, séquestré au lancement, remis au gagnant à la fin) et validation des mises par joueur.
-- Idempotent : à coller dans Neon → SQL Editor.

CREATE TABLE IF NOT EXISTS arena_stakes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id     uuid NOT NULL REFERENCES arena_matches(id) ON DELETE CASCADE,
  user_id      text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  accessory_id text NOT NULL,
  taken_at     timestamptz,
  settled_at   timestamptz,
  winner_id    text REFERENCES "user"(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS arena_stakes_match_user_accessory_idx ON arena_stakes (match_id, user_id, accessory_id);
CREATE INDEX IF NOT EXISTS arena_stakes_user_idx ON arena_stakes (user_id);

ALTER TABLE arena_players ADD COLUMN IF NOT EXISTS stakes_agreed_at timestamptz;
