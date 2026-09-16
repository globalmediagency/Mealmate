-- Migration 014 — « Défendre » : le type de partie est enregistré.
-- kind : 'catch' (attrape-aliments) ou 'defense' (tower defense sur le marqueur).
-- Idempotent : à coller dans Neon → SQL Editor.

ALTER TABLE play_sessions ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'catch';
ALTER TABLE play_sessions DROP CONSTRAINT IF EXISTS play_sessions_kind_check;
ALTER TABLE play_sessions ADD CONSTRAINT play_sessions_kind_check CHECK (kind IN ('catch', 'defense'));
