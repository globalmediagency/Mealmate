-- Migration 011 — la pension devient une proposition que l'hôte accepte ou décline.
-- status : 'pending' (en attente de l'hôte), 'active' (séjour en cours), 'ended'.
-- owner_seen_at : le propriétaire a vu la réponse de l'hôte (ou un retour anticipé).
-- Idempotent : à coller dans Neon → SQL Editor.

ALTER TABLE boardings ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';
ALTER TABLE boardings ADD COLUMN IF NOT EXISTS owner_seen_at timestamptz;
UPDATE boardings SET status = 'ended' WHERE ended_at IS NOT NULL AND status <> 'ended';
ALTER TABLE boardings DROP CONSTRAINT IF EXISTS boardings_end_reason_check;
ALTER TABLE boardings ADD CONSTRAINT boardings_end_reason_check CHECK (end_reason IS NULL OR end_reason IN ('recovered', 'returned', 'expired', 'died', 'declined', 'cancelled'));
ALTER TABLE boardings DROP CONSTRAINT IF EXISTS boardings_status_check;
ALTER TABLE boardings ADD CONSTRAINT boardings_status_check CHECK (status IN ('pending', 'active', 'ended'));
