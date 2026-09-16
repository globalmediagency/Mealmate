-- Migration 018 — Ping-pong : nouveau type de partie entre amis (mode 'pingpong'), points par joueur, type de session 'pingpong'.
-- Idempotent : à coller dans Neon → SQL Editor.

ALTER TABLE arena_matches DROP CONSTRAINT IF EXISTS arena_matches_mode_check;
ALTER TABLE arena_matches ADD CONSTRAINT arena_matches_mode_check CHECK (mode IN ('arena', 'coop', 'pingpong'));
ALTER TABLE arena_players ADD COLUMN IF NOT EXISTS points integer NOT NULL DEFAULT 0;

ALTER TABLE play_sessions DROP CONSTRAINT IF EXISTS play_sessions_kind_check;
ALTER TABLE play_sessions ADD CONSTRAINT play_sessions_kind_check CHECK (kind IN ('catch', 'defense', 'arena', 'coop', 'pingpong'));
