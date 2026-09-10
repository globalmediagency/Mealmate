-- Migration 006 — phase 8 (Strava).
-- Display name of the connected athlete (first name only), shown on the activity page.
-- Idempotent : à coller dans Neon → SQL Editor.

ALTER TABLE strava_connections ADD COLUMN IF NOT EXISTS athlete_name text;
