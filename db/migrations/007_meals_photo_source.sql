-- Migration 007 — détection des photos d'écran.
-- Origin of the meal picture as judged by the AI: real | screen | printed | unknown.
-- Idempotent : à coller dans Neon → SQL Editor.

ALTER TABLE meals ADD COLUMN IF NOT EXISTS photo_source text NOT NULL DEFAULT 'real';
