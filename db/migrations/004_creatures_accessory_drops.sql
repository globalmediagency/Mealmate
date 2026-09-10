-- Migration 004 — phase 5 (accessoires).
-- Number of accessory chests already opened for this creature: chests earned
-- = floor(steps since hatching / 5 000) − accessory_drops.
-- Idempotent : à coller dans Neon → SQL Editor.

ALTER TABLE creatures ADD COLUMN IF NOT EXISTS accessory_drops integer NOT NULL DEFAULT 0;
