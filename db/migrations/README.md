# Migrations

`db/init.sql` crée le schéma complet de la version courante (idempotent).

Chaque évolution ultérieure du schéma est livrée ici sous la forme
`NNN_description.sql` (ex. `001_add_creature_mood_bonus.sql`), **idempotente**
(`ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, …). À coller dans
l'éditeur SQL de Neon dans l'ordre des numéros.

| Fichier | Phase | Contenu |
|---|---|---|
| `001_step_entries_credited_steps.sql` | 2 | `step_entries.credited_steps` (pas déjà convertis en effets) |
| `002_creatures_mourned_at.sql` | 3 | `creatures.mourned_at` (écran de deuil vu) |
| `003_game_settings.sql` | 4 | table `game_settings` (règles de jeu réglables depuis `/admin`) |
| `004_creatures_accessory_drops.sql` | 5 | `creatures.accessory_drops` (coffres d'accessoires déjà ouverts) |
| `005_gifts_trades.sql` | 7 | tables `gifts` (médicaments offerts aux amis) et `trades` (trocs d'accessoires) |
| `006_strava_athlete_name.sql` | 8 | `strava_connections.athlete_name` (prénom affiché) |
| `007_meals_photo_source.sql` | 9 | `meals.photo_source` (vraie assiette / écran / imprimé, jugé par l'IA) |
| `008_accessory_copies_gift_kind.sql` | 9 | `user_accessories.qty` (exemplaires) et `gifts.kind` (soin ou accessoire offert) |
| `009_boardings.sql` | 10 | table `boardings` (créature confiée en pension à un ami, 30 jours au plus) |
| `010_coaching.sql` | 11 | tables `coachings` et `meal_reviews`, compteurs de récompenses sur `profiles` |

Un `init.sql` fraîchement exécuté contient déjà toutes ces évolutions.
