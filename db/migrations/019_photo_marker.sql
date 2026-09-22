-- Migration 019 — Marqueur photo : une photo par joueur reconnue par la caméra à la place du marqueur imprimé (clé R2, activation, date).
-- Idempotent : à coller dans Neon → SQL Editor.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS photo_marker_key text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS photo_marker_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS photo_marker_updated_at timestamptz;
