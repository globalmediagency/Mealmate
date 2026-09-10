# Migrations

`db/init.sql` crée le schéma complet de la version courante (idempotent).

Chaque évolution ultérieure du schéma est livrée ici sous la forme
`NNN_description.sql` (ex. `001_add_creature_mood_bonus.sql`), **idempotente**
(`ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, …). À coller dans
l'éditeur SQL de Neon dans l'ordre des numéros.

| Fichier | Phase | Contenu |
|---|---|---|
| `001_step_entries_credited_steps.sql` | 2 | `step_entries.credited_steps` (pas déjà convertis en effets) |

Un `init.sql` fraîchement exécuté contient déjà toutes ces évolutions.
