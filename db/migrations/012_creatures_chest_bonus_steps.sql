-- Migration 012 — effets de l'humeur : pas bonus pour les coffres.
-- chest_bonus_steps : pas supplémentaires comptés pour les coffres, gagnés
-- quand des pas sont crédités à une créature de bonne humeur (règle admin).
-- Idempotent : à coller dans Neon → SQL Editor.

ALTER TABLE creatures ADD COLUMN IF NOT EXISTS chest_bonus_steps integer NOT NULL DEFAULT 0;
