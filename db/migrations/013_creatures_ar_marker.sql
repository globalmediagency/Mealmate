-- Migration 013 — « Voir en vrai » : un marqueur imprimé par créature.
-- ar_marker : numéro AprilTag 36h11 (0–586) attribué à la première demande.
-- Idempotent : à coller dans Neon → SQL Editor.

ALTER TABLE creatures ADD COLUMN IF NOT EXISTS ar_marker integer;
