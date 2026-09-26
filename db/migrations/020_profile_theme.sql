-- Migration 020 — design of the site chosen by the player (« Plus » → Apparence); NULL = the admin's default.
-- (019 was the photo marker, since removed: its columns are no longer read.)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS theme text;
