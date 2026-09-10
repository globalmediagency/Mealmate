-- Migration 001 — phase 2 (œuf & éclosion).
-- Tracks how many of the day's steps were already converted into creature
-- effects, so that editing the daily entry never credits twice.
-- Idempotent: safe to run several times in Neon → SQL Editor.

ALTER TABLE step_entries ADD COLUMN IF NOT EXISTS credited_steps integer NOT NULL DEFAULT 0;
