-- Migration 016 — « Défendre à deux » : mode coopératif sur les parties entre amis.
-- arena_matches.mode ('arena' ou 'coop'), graine des vagues, état de l'hôte ; nouveau type de partie 'coop'.
-- Idempotent : à coller dans Neon → SQL Editor.

ALTER TABLE arena_matches ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'arena';
ALTER TABLE arena_matches DROP CONSTRAINT IF EXISTS arena_matches_mode_check;
ALTER TABLE arena_matches ADD CONSTRAINT arena_matches_mode_check CHECK (mode IN ('arena', 'coop'));
ALTER TABLE arena_matches ADD COLUMN IF NOT EXISTS seed integer NOT NULL DEFAULT 0;
ALTER TABLE arena_matches ADD COLUMN IF NOT EXISTS state jsonb;
ALTER TABLE arena_matches ADD COLUMN IF NOT EXISTS state_at timestamptz;

ALTER TABLE play_sessions DROP CONSTRAINT IF EXISTS play_sessions_kind_check;
ALTER TABLE play_sessions ADD CONSTRAINT play_sessions_kind_check CHECK (kind IN ('catch', 'defense', 'arena', 'coop'));
