# CLAUDE.md — repères pour travailler sur MealMate

## Commandes

| Commande | Rôle |
|---|---|
| `npm run dev` | Serveur de développement (Turbopack) |
| `npm run build` | Build de production — doit passer **sans aucune variable d'environnement** |
| `npm run lint` | ESLint (config Next + TypeScript) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Tests unitaires `vitest` (`lib/**/*.test.ts`) |

Avant chaque commit de fin de phase : `npm run build && npm run lint && npm test`.

## Contexte de travail du propriétaire

- Il travaille **100 % dans un navigateur** : GitHub, Vercel, Neon, Cloudflare R2, Google AI Studio, Stripe, Strava. Aucune commande locale, aucun `localhost`.
- Il teste sur les **URL de preview Vercel** (une par PR) puis en production après merge sur `main`.
- Chaque PR doit contenir : ce qui est testable sur la preview + une **checklist des actions manuelles** (variables Vercel, SQL à coller dans Neon, réglages dashboards).
- Interface en **français** ; code, identifiants et commentaires en **anglais**.

## Conventions

- **Jamais** de lecture d'env au niveau module pour créer un client : utiliser `requireEnv()` dans une fonction `getXxx()` mise en cache (`lib/db/index.ts`, `lib/auth/index.ts` sont les modèles). Une variable manquante lève `ConfigError` → 503 JSON dans les routes (`handleRouteError`) ou bandeau `ConfigBanner` dans les pages (`safeGetSession`).
- Pages qui lisent l'env ou la session : `export const dynamic = "force-dynamic"`.
- Routes API : `try { … } catch (e) { return handleRouteError(e) }`, entrées validées avec `zod`, réponses via `ok()` / `fail(code, message, status)`.
- Toute requête de données filtre sur `session.user.id`.
- Schéma : modifier **à la fois** `lib/db/schema.ts` et un nouveau fichier `db/migrations/NNN_description.sql` idempotent (`ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`…). `db/init.sql` reste la photo complète du schéma courant : le mettre à jour aussi.
- Constantes de jeu : uniquement dans `lib/game/config.ts`. Logique de jeu pure (tick, tirages, effets) dans `lib/game/*.ts` avec un test `*.test.ts` à côté.
- UI : composants dans `components/`, classes Tailwind avec `cn()`. Tokens de couleur : `ink-*`, `sage-*`, `brass-*`, `cream-*`, `health`, `hunger`, `mood`, `danger`. Titres en `font-display`.
- Accessibilité : boutons ≥ 44 px, champs `text-base`, `aria-*` sur les icônes décoratives, animations coupées par `prefers-reduced-motion` (déjà global dans `globals.css`).
- Textes utilisateur : ton bienveillant, tutoiement, jamais culpabilisant.

## Ajouter une espèce (à partir de la phase 2)

1. Ouvrir `lib/creatures/species/<tier>.ts` et ajouter un objet `Species` (`id`, `tier`, `rarity`, `name`, `tagline`, `palette`, `parts`, `anchors`). Respecter le quota par rareté (9 communs, 6 rares, 4 très rares, 1 légendaire par niveau).
2. Si une nouvelle part est nécessaire, la créer dans `components/creatures/parts/` et l'enregistrer dans le registre de parts.
3. Vérifier le rendu dans `/dev/creatures` (`NEXT_PUBLIC_DEV_GALLERY=true`) sur les 4 stades × 4 états.
4. Lancer `npm test` : un test vérifie les quotas et l'unicité des identifiants.

## Ajouter un accessoire (à partir de la phase 5)

1. Ajouter l'entrée dans `lib/accessories/catalog.ts` (`id`, `name`, `slot` ∈ `head | eyes | neck | body`, `rarity`).
2. Créer le composant SVG dans `components/accessories/` positionné sur l'`anchor` du slot et l'enregistrer dans le registre.
3. Contrôler dans `/dev/creatures` sur plusieurs espèces et stades.

## Points d'attention

- Vercel Hobby : pas de WebSocket, pas de cron fiable → toute logique temporelle est calculée paresseusement à la lecture (`lib/game/tick.ts`).
- Better Auth utilise un `baseURL` dynamique (`*.vercel.app` autorisé) : ne pas définir `BETTER_AUTH_URL`.
- Neon HTTP ne supporte pas `db.transaction()` : utiliser `db.batch()` ou des mises à jour conditionnelles.
- Les photos de repas sont privées : bucket R2 privé, presigned GET courts, jamais exposées aux amis.
