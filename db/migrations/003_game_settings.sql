-- Migration 003 — espace admin (règles de jeu paramétrables).
-- Une seule ligne (id = 'default') contient les surcharges des constantes de
-- lib/game/config.ts (exigence des créatures par niveau, seuils, tick).
-- Idempotent : à coller dans Neon → SQL Editor.

CREATE TABLE IF NOT EXISTS game_settings (
  id         text PRIMARY KEY,
  data       jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);
