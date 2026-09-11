-- Migration 008 — exemplaires multiples d'accessoires et dons entre amis.
-- user_accessories.qty : number of copies owned (trades and gifts move copies around).
-- gifts.kind : 'medicine' (existing rows) or 'accessory' (an accessory given to a friend).
-- Idempotent : à coller dans Neon → SQL Editor.

ALTER TABLE user_accessories ADD COLUMN IF NOT EXISTS qty integer NOT NULL DEFAULT 1;
ALTER TABLE gifts ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'medicine';
