# MealMate — Spécification technique

> Prototype web mobile-first d'un Tamagotchi pour adultes nourri avec des photos
> de vrais repas analysées par IA. Ce document décrit l'architecture, le schéma
> de données et les décisions prises. Les règles du jeu détaillées (constantes)
> vivent dans `lib/game/config.ts`.

## 1. Vue d'ensemble

| Couche | Choix |
|---|---|
| Framework | Next.js 15 (App Router, React 19, TypeScript strict) |
| UI | Tailwind CSS v4, `lucide-react`, `recharts` (phase 3), SVG composés par code pour les créatures |
| PWA | `app/manifest.ts`, icônes PNG (192/512/maskable/apple), `public/sw.js` (fallback hors-ligne + cache statique), `display: standalone`, `viewport-fit: cover` |
| Base de données | Neon Postgres via `@neondatabase/serverless` (driver HTTP) + Drizzle ORM |
| Auth | Better Auth 1.7 + adaptateur Drizzle (email + mot de passe ; Google si clés présentes) |
| Stockage photos | Cloudflare R2 (S3), bucket privé, upload via route API, lecture via presigned GET 1 h (phase 3) |
| IA | Google Gemini (REST direct, JSON strict) (phase 3) |
| Paiement | Stripe Checkout + webhook, prix inline (phase 7) |
| Activité | Strava OAuth2 + bouton Synchroniser (phase 8) |
| Hébergement | Vercel Hobby : fonctions serverless courtes, pas de WebSocket, pas de cron → logique temporelle **paresseuse** (tick à la lecture) |
| Tests | `vitest` sur la logique pure (`lib/**/*.test.ts`) |

Langue de l'interface : **français**. Code, identifiants et commentaires : anglais.

## 2. Arborescence

```
app/
  layout.tsx            Root layout : polices (Manrope + Fraunces), metadata PWA, SW
  page.tsx              Landing publique (redirige vers /home si connecté)
  manifest.ts           Manifest PWA (/manifest.webmanifest)
  icon.svg              Favicon
  (auth)/login, signup  Connexion / inscription (pseudo choisi à l'inscription)
  onboarding/           Choix du pseudo si le profil n'existe pas encore (ex. Google)
  (app)/                Zone connectée : layout avec barre basse
    home/               Onglet Créature
    meals/ activity/ friends/ more/
  privacy/ legal/ offline/
  api/
    auth/[...all]       Better Auth (catch-all)
    profile/ (+check)   Création / vérification du pseudo
    health/             Statut non secret de la configuration
components/             UI (button, card, field…), layout (bottom-nav), auth, brand, pwa, system
lib/
  env.ts                Accès aux variables d'env, ConfigError, statut de config
  db/schema.ts          Schéma Drizzle (synchrone avec db/init.sql)
  db/index.ts           getDb() paresseux (Neon HTTP)
  auth/index.ts         getAuth() paresseux (Better Auth)
  auth/client.ts        Client navigateur (better-auth/react)
  auth/session.ts       getSession / requireSession / requireViewer
  profile/              Pseudo (zod), code ami, service profils
  game/config.ts        Toutes les constantes du jeu (§ 3 du brief)
  game/growth.ts        Stades par XP
  api/respond.ts        Réponses JSON normalisées { error: { code, message } }
db/init.sql             Schéma complet idempotent (à coller dans Neon)
db/migrations/          Évolutions ultérieures, idempotentes
middleware.ts           Redirections optimistes selon la présence du cookie de session
public/sw.js, icons/    Service worker et icônes
```

## 3. Principes d'architecture

### 3.1 Aucune dépendance du build aux variables d'environnement
- `lib/env.ts` expose `optionalEnv`, `requireEnv` (lève `ConfigError`) et `getConfigStatus()` (booléens non secrets).
- Chaque client externe est construit **à la première requête** : `getDb()`, `getAuth()`, et plus tard `getR2()`, `getGemini()`, `getStripe()`.
- Les routes API convertissent `ConfigError` en `503 { error: { code: "config_missing" } }` ; les pages affichent un bandeau « Configuration incomplète » listant les variables manquantes.
- Les pages qui lisent l'env sont `force-dynamic` pour ne jamais figer une valeur au build.

### 3.2 Auth multi-hôtes (previews Vercel)
- Better Auth est configuré avec un `baseURL` **dynamique** : `allowedHosts = ["localhost:3000", "*.vercel.app", host(APP_URL), AUTH_ALLOWED_HOSTS…]`, `fallback = APP_URL`. L'URL de base est résolue à partir de l'en-tête `Host` de chaque requête, donc chaque URL de preview fonctionne sans configuration.
- Conséquence pour Google : la redirect URI est `https://<hôte>/api/auth/callback/google` ; seules les URL déclarées dans la console Google fonctionnent (typiquement la production). Sur une preview, le bouton apparaît mais Google refusera la redirection tant que l'URL n'est pas déclarée.
- Cookie de session avec cache (5 min) pour limiter les lectures DB. `middleware.ts` ne fait qu'un test de présence du cookie ; la vraie vérification est serveur (`requireViewer`).

### 3.3 Profil et pseudo
- Le pseudo est saisi **à l'inscription** (champ `name` de Better Auth). Le hook `databaseHooks.user.create.after` crée la ligne `profiles` (pseudo + code ami) si le nom est un pseudo valide et libre.
- Si ce n'est pas le cas (connexion Google avec un nom « Jean Dupont », collision…), l'utilisateur est redirigé vers `/onboarding` pour choisir un pseudo. Toute page de la zone connectée exige un profil.
- Unicité du pseudo **insensible à la casse** (index unique sur `lower(username)`), affichage tel que saisi.
- Code ami : `MM-` + 6 caractères d'un alphabet sans ambiguïté (`ABCDEFGHJKLMNPQRSTUVWXYZ23456789`).

### 3.4 Sécurité
- Secrets uniquement côté serveur ; `NEXT_PUBLIC_*` réservé aux options publiques.
- Toutes les requêtes de données filtrent par `user_id = session.user.id`.
- Validation `zod` de toutes les entrées ; erreurs normalisées.
- Mots de passe : 8 caractères minimum (hachage géré par Better Auth).

### 3.5 Temps et tick paresseux (phase 4)
- Aucune tâche planifiée. À chaque lecture d'une créature vivante, `applyTick(creature, now)` (fonction pure, testée) calcule les heures écoulées depuis `last_tick_at`, applique faim / santé / humeur, gère `sick_since`, la mort éventuelle, puis persiste. Au-delà de 72 h, la dégradation continue à 25 % du rythme.
- Les notions de « jour » utilisent le fuseau `Europe/Paris`.
- Persistance atomique via une requête `UPDATE … WHERE last_tick_at = <valeur lue>` (concurrence optimiste) ou `db.batch()` (Neon HTTP ne supporte pas les transactions interactives).

## 4. Schéma de données

Source de vérité : `db/init.sql` (idempotent) ⇄ `lib/db/schema.ts`. Colonnes en `snake_case`, horodatages en `timestamptz`.

| Table | Rôle | Points clés |
|---|---|---|
| `user`, `session`, `account`, `verification` | Better Auth | Index sur `session.user_id`, `account.user_id`, `verification.identifier` |
| `profiles` | Pseudo + code ami | PK `user_id`, `friend_code` unique, index unique `lower(username)` |
| `creatures` | Œuf → vivante → morte | `status ∈ {egg, alive, dead}`, `tier`, `species_id`, `rarity`, stats (`health`, `hunger`, `mood` en double precision, `xp` entier), `sick_since`, `protected_until`, `last_tick_at`, mort (`died_at`, `death_cause`, `lifespan_days`). Index `(user_id, status)` + **index unique partiel** `user_id WHERE status IN ('egg','alive')` (une seule créature active) |
| `meals` | Repas analysés | `image_key`, `image_hash` (SHA-256, anti-doublon 24 h), `score`, `verdict`, `foods` jsonb, `macros` jsonb, `portion`, `comment`, `creature_line`, `health_delta` |
| `step_entries` | Pas | `date`, `steps`, `source ∈ {manual, strava, pedometer}`, `strava_activity_id` unique ; index unique partiel `(user_id, date, source) WHERE source='manual'` |
| `play_sessions` | Mini-jeu | `creature_id`, `user_id`, `score` |
| `user_accessories` | Accessoires possédés | PK `(user_id, accessory_id)` |
| `creature_outfits` | Tenue équipée | PK `(creature_id, slot)`, `slot ∈ {head, eyes, neck, body}` |
| `friendships` | Amis | `requester_id`, `addressee_id`, `status ∈ {pending, accepted}`, unique sur la paire, `requester ≠ addressee` |
| `purchases` | Achats Stripe | `stripe_session_id` unique (idempotence webhook), `item`, `amount_cents`, `status` |
| `inventory` | Médicaments | PK `(user_id, item)`, `qty` |
| `strava_connections` | Lien Strava | PK `user_id`, tokens, `expires_at`, `last_sync_at` |

## 5. API (`app/api/…`)

Réponses JSON typées ; erreurs `{ error: { code, message } }` avec codes stables :
`unauthorized` (401), `validation_error` (400), `username_taken` / `profile_exists` (409), `config_missing` (503), `internal_error` (500).

Phase 1 :
- `GET|POST /api/auth/*` — Better Auth.
- `GET /api/health` — `{ ok, config: { database, authSecret, google, r2, gemini, stripe, strava } }`.
- `GET /api/profile/check?username=` — `{ valid, available, message? }`.
- `GET /api/profile` — profil courant ; `POST /api/profile { username }` — création (onboarding).

Phases suivantes (brief § 7) : `creatures`, `meals`, `steps`, `play`, `accessories`, `friends`, `shop/checkout`, `webhooks/stripe`, `inventory/use`, `strava/*`, `account`.

## 6. Design

- Thème sombre premium : noirs profonds (`ink-*`), verts sauge (`sage-*`), accents laiton (`brass-*`), texte crème. Tokens dans `app/globals.css` (`@theme`).
- Typographie : Fraunces (titres) + Manrope (texte), servies par `next/font` (auto-hébergées au build).
- Mobile-first, largeur max 28 rem, boutons ≥ 44 px, champs à 16 px (pas de zoom iOS), `safe-area` iOS, `prefers-reduced-motion` respecté globalement.
- Navigation par barre basse : Créature · Repas · Activité · Amis · Plus.

## 7. Phases

1. **Socle** (cette PR) : Next.js, Tailwind, thème, PWA, Better Auth, Drizzle, `db/init.sql`, `.env.example`, README, landing, inscription/connexion, onboarding pseudo, onglets avec états « bientôt », page Plus (profil, code ami, état des services, déconnexion).
2. Œuf & éclosion. 3. Nourrir. 4. Vie & mort. 5. Jouer & accessoires (60 espèces). 6. Amis. 7. Boutique Stripe. 8. Strava. 9. Finitions.

## 8. Décisions

| # | Décision | Pourquoi |
|---|---|---|
| D1 | **Next.js 15.5** (dernière 15.x) plutôt que 16 | Le brief impose Next 15 ; 15.5 est la version stable la plus récente de la branche. Migration 16 possible plus tard. |
| D2 | **Tailwind CSS v4** (`@theme`) | Version courante, configuration dans le CSS, aucun `tailwind.config` à maintenir. |
| D3 | Driver **Neon HTTP** (`neon()` + `drizzle-orm/neon-http`) | Le plus simple et le plus rapide en serverless ; pas de WebSocket. Les opérations multi-requêtes utiliseront `db.batch()` ou des `UPDATE` conditionnels. |
| D4 | Pseudo saisi à l'inscription, profil créé par hook, **`/onboarding`** en repli | Une seule étape pour l'utilisateur email ; couvre Google et les collisions sans transaction multi-étapes côté client. |
| D5 | Unicité du pseudo insensible à la casse, recherche exacte insensible à la casse | Évite « Chabond » / « chabond » ; plus naturel sur mobile. |
| D6 | Code ami `MM-` + **6** caractères | Le brief dit « 6 caractères » et donne un exemple à 5 ; on retient 6 (32⁶ ≈ 1 milliard de codes) avec préfixe fixe `MM-`. Saisie tolérante (minuscules, sans préfixe). |
| D7 | `baseURL` dynamique Better Auth avec `*.vercel.app` | Chaque preview Vercel a son propre hôte ; aucune variable à changer par PR. |
| D8 | Pas de vérification d'email, mot de passe ≥ 8 | Conforme au brief V1. |
| D9 | Cache de session en cookie (5 min) | Réduit les lectures Neon sur chaque page ; déconnexion toujours immédiate côté serveur. |
| D10 | `play_sessions.user_id` ajouté | Simplifie les vérifications de propriété et les limites/jour sans jointure. |
| D11 | Stats `health/hunger/mood` en `double precision` | Les pertes horaires sont fractionnaires (−0,5/h). |
| D12 | Schéma complet dès `init.sql` | Un seul copier-coller pour l'utilisateur ; les phases suivantes n'ajoutent des migrations que si nécessaire. |
| D13 | Service worker minimal (fallback `/offline` + cache `/_next/static` et icônes), enregistré en production seulement | Installabilité PWA sans risquer de servir des pages périmées ; les API ne sont jamais mises en cache. |
| D14 | Modèle Gemini : `GEMINI_MODEL` sinon valeur par défaut fixée en phase 3 après vérification de la doc | La documentation des modèles n'était pas accessible depuis l'environnement de développement de la phase 1 ; à confirmer lors de la phase 3. |
| D15 | `middleware.ts` teste seulement la présence du cookie de session | Évite d'embarquer `jose`/crypto dans l'Edge Runtime ; l'autorisation réelle reste côté serveur. |
