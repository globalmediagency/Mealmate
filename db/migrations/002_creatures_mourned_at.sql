-- Migration 002 — phase 3 (vie & mort).
-- Records when the user acknowledged a creature's death (mourning screen),
-- so that the screen is shown once before choosing a new egg.
-- Idempotent: safe to run several times in Neon → SQL Editor.

ALTER TABLE creatures ADD COLUMN IF NOT EXISTS mourned_at timestamptz;
