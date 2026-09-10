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

### 3.6 Créatures : rendu SVG composé (phase 2)
- Données : `lib/creatures/species/<tier>.ts` (une entrée par espèce : `palette`, `parts`, `anchors`, `signature`), registre dans `lib/creatures/index.ts`. Un test garantit l'unicité des identifiants et les quotas par rareté.
- Rendu : `components/creatures/creature.tsx` expose `<Creature species stage state size animated reaction silhouette />` derrière l'interface `CreatureRenderer` (`setCreatureRenderer()` permettra de brancher des sprites pixel-art). Les parts vivent dans `components/creatures/parts/` (bodies, ears, eyes, mouths, tails, markings, extras, signatures, effects), la géométrie par silhouette dans `components/creatures/layout.ts`.
- Stades : échelle globale + tête agrandie pour les bébés (corps `round`/`tall`) ou visage agrandi (corps `blob`/`egg`), marques progressives (0 % bébé, 60 % enfant, 100 % adulte), aura + accessoire signature au stade Sage.
- États : filtres `feColorMatrix` (fatigué = désaturé, malade = verdâtre + goutte + nuage + tremblement, fantôme = gris-bleu à 60 %), paupières animées par CSS (`transform` uniquement, `transform-box: fill-box`), clignement pseudo-aléatoire déterministe (hash de l'espèce, pas de mismatch d'hydratation).
- Réactions ponctuelles via la prop `reaction` (`eat`, `play`, `heal`, `disgust`, `tap`) : rebond, saut, étincelles, recul + nuage, cœurs.
- Œufs : `components/creatures/egg.tsx` (motifs par niveau, 4 niveaux de fissure, phases `shake`/`burst`), décor `components/creatures/environment.tsx`.
- Galeries de validation : `/dev/creatures` (espèces × stades × états) et `/dev/screens` (écrans avec données factices), visibles seulement si `NEXT_PUBLIC_DEV_GALLERY=true`.

### 3.7 Œuf, pas et éclosion (phase 2)
- `POST /api/creatures { tier }` crée l'œuf (index unique partiel : un seul œuf/créature vivante). Les niveaux sans espèce sont verrouillés (`tier_unavailable`).
- Pas manuels : une entrée par jour Europe/Paris (`step_entries`, upsert sur l'index partiel `manual`), plafonnée à 40 000. `egg_steps` = somme des pas depuis le jour du choix de l'œuf (recalculée à chaque lecture, donc l'édition d'une saisie est prise en compte).
- Créature vivante : `stepCredit(total, credited)` convertit uniquement les nouveaux milliers de pas (+1 santé/1 000, max +10/jour ; +2 XP/1 000) et mémorise `credited_steps` pour ne jamais créditer deux fois.
- Éclosion : `POST /api/creatures/hatch` vérifie le seuil, tire l'espèce (`drawSpecies`, `crypto.randomInt`, repli sur une rareté inférieure si le niveau est incomplet), passe en `alive` avec stats pleines ; `POST /api/creatures/name` fixe le nom une seule fois (2–20 caractères).
- Accueil : machine à états serveur dans `app/(app)/home/page.tsx` → choix d'œuf, incubation, révélation/nommage, ou accueil créature (décor, jauges, bulle contextuelle `lib/game/dialogue.ts`, actions).

### 3.8 Tick paresseux, maladie et mort (phase 3)
- `lib/game/tick.ts` : `applyTick(creature, now)` pure et testée. Heures écoulées → heures « effectives » (plein régime jusqu'à 72 h, puis 25 %). Faim `+hungerPerHour × t` ; santé `−healthLossPerHour` seulement pendant les heures où la faim dépasse 80 (calcul du moment de franchissement) ; humeur `−moodLossPerHour × t`. `sick_since` est posé quand la santé passe sous 30 (instant de franchissement estimé, jamais avant `last_tick_at`) et remis à `null` au-dessus. Mort quand `now − sick_since ≥ jours du niveau`, sauf `protected_until` actif : `status = dead`, `died_at`, `death_cause = sickness`, `lifespan_days`.
- `lib/creatures/tick-service.ts` : persistance par `UPDATE … WHERE status = 'alive' AND date_trunc('milliseconds', last_tick_at) = <valeur lue>` (concurrence optimiste, relecture en cas de perte).
- Le tick s'applique à chaque lecture (`getActiveCreatureTicked`) : accueil, activité, repas, saisie des pas. Sans repas, une créature facile meurt en ~13 jours, une difficile en ~6.
- Deuil : la créature morte reste « active » pour l'écran de deuil jusqu'à `mourned_at` (migration 002) ; `POST /api/creatures/mourn` puis choix d'un nouvel œuf. `/cimetière` liste les créatures mortes en version fantôme.

### 3.9 Nourrir (phase 3)
- Client : `<input type="file" accept="image/*" capture="environment">` (+ galerie), redimensionnement `lib/images/resize-client.ts` (≤ 1024 px, JPEG 0,8, ≤ 1,5 Mo, orientation EXIF respectée), `POST /api/meals` en multipart.
- Serveur (`lib/meals/service.ts`) : tick → limite 5 repas / jour Paris (`(created_at at time zone 'Europe/Paris')::date`) → SHA-256 anti-doublon 24 h → analyse Gemini → si `is_food` faux : 422 sans stockage → effets (`lib/game/meal-effects.ts`) → upload R2 (`meals/<user>/<meal>.jpg`, bucket privé) → insertion + mise à jour des stats. L'analyse et le stockage sont injectés (`MealAnalyzer`, `ObjectStorage`) pour les tests.
- Gemini (`lib/ai/gemini.ts`) : REST `generateContent`, image inline, `systemInstruction` en français (`lib/ai/meal-prompt.ts`), `responseMimeType: application/json` + `responseSchema`, validation zod (`lib/ai/meal-schema.ts`), une nouvelle tentative si JSON invalide, modèle suivant sur 404/429/5xx. Modèle : `GEMINI_MODEL` sinon dernier `gemini-X.Y-flash` stable listé par l'API `models` (cache 1 h), sinon chaîne de repli.
- Affichage : URLs presignées GET 1 h générées à chaque lecture ; historique + graphique 7/30 jours (`recharts`) + moyenne hebdo.

### 3.10 Espace admin et règles paramétrables (phase 4)
- `/admin` : connexion par identifiant + mot de passe lus dans `ADMIN_USERNAME` / `ADMIN_PASSWORD` (comparaison en temps constant, 8 échecs max par 15 min et par IP). Session = cookie `mm_admin` HMAC-SHA256 (`<expiration>.<signature>`, 12 h) signé avec `BETTER_AUTH_SECRET` + mot de passe admin : changer le mot de passe révoque toutes les sessions.
- Règles (`lib/game/rules.ts`) : par niveau `hatchSteps`, `healthyScoreThreshold`, `hungerPerHour`, `healthLossPerHourWhenStarving`, `moodLossPerHour`, `sickDaysBeforeDeath` ; communes `hungerDamageThreshold`, `tick.fullRateHoursCap`, `tick.slowRate`, `feeding.maxMealsPerDay`. Validation zod avec bornes, fusion sur les défauts (`DEFAULT_RULES` = constantes de `config.ts`).
- Stockage : table `game_settings` (ligne `default`, jsonb des surcharges, migration 003). `getGameRules()` : cache React par requête + cache mémoire 60 s par instance ; table absente → défauts (l'app ne casse jamais).
- Consommateurs : `applyTick(creature, now, rules)`, `hatchProgress`, `toCreatureView` (expose `sickDaysBeforeDeath`, `daysUntilDeath`, seuils), `mealEffects`, `feedCreature` (repas max/jour), `hatchEgg`, écran de choix d'œuf.
- Tableau de bord : compteurs anonymes (comptes, œufs, vivantes, malades, cimetière, repas) et simulation « jamais nourrie » (`simulateNeglect`).
- Accueil : `CareAlert` prévient quand la créature a faim, est affamée ou malade, avec le temps restant avant la mort.

## 4. Schéma de données

Source de vérité : `db/init.sql` (idempotent) ⇄ `lib/db/schema.ts`. Colonnes en `snake_case`, horodatages en `timestamptz`.

| Table | Rôle | Points clés |
|---|---|---|
| `user`, `session`, `account`, `verification` | Better Auth | Index sur `session.user_id`, `account.user_id`, `verification.identifier` |
| `profiles` | Pseudo + code ami | PK `user_id`, `friend_code` unique, index unique `lower(username)` |
| `creatures` | Œuf → vivante → morte | `status ∈ {egg, alive, dead}`, `tier`, `species_id`, `rarity`, stats (`health`, `hunger`, `mood` en double precision, `xp` entier), `sick_since`, `protected_until`, `last_tick_at`, mort (`died_at`, `death_cause`, `lifespan_days`), `mourned_at` (migration 002). Index `(user_id, status)` + **index unique partiel** `user_id WHERE status IN ('egg','alive')` (une seule créature active) |
| `meals` | Repas analysés | `image_key`, `image_hash` (SHA-256, anti-doublon 24 h), `score`, `verdict`, `foods` jsonb, `macros` jsonb, `portion`, `comment`, `creature_line`, `health_delta` |
| `step_entries` | Pas | `date`, `steps`, `source ∈ {manual, strava, pedometer}`, `strava_activity_id` unique, `credited_steps` (pas déjà convertis en effets, migration 001) ; index unique partiel `(user_id, date, source) WHERE source='manual'` |
| `play_sessions` | Mini-jeu | `creature_id`, `user_id`, `score` |
| `user_accessories` | Accessoires possédés | PK `(user_id, accessory_id)` |
| `creature_outfits` | Tenue équipée | PK `(creature_id, slot)`, `slot ∈ {head, eyes, neck, body}` |
| `friendships` | Amis | `requester_id`, `addressee_id`, `status ∈ {pending, accepted}`, unique sur la paire, `requester ≠ addressee` |
| `purchases` | Achats Stripe | `stripe_session_id` unique (idempotence webhook), `item`, `amount_cents`, `status` |
| `inventory` | Médicaments | PK `(user_id, item)`, `qty` |
| `strava_connections` | Lien Strava | PK `user_id`, tokens, `expires_at`, `last_sync_at` |
| `game_settings` | Règles admin | PK `id` (= `default`), `data` jsonb (surcharges), `updated_at`, `updated_by` (migration 003) |

## 5. API (`app/api/…`)

Réponses JSON typées ; erreurs `{ error: { code, message } }` avec codes stables :
`unauthorized` (401), `validation_error` (400), `username_taken` / `profile_exists` (409), `config_missing` (503), `internal_error` (500).

Phase 1 :
- `GET|POST /api/auth/*` — Better Auth.
- `GET /api/health` — `{ ok, config: { database, authSecret, google, r2, gemini, stripe, strava } }`.
- `GET /api/profile/check?username=` — `{ valid, available, message? }`.
- `GET /api/profile` — profil courant ; `POST /api/profile { username }` — création (onboarding).

Phase 2 :
- `GET /api/creatures` — œuf ou créature vivante (`CreatureView`) ; `POST /api/creatures { tier }` — nouvel œuf.
- `POST /api/creatures/hatch` — éclosion ; `POST /api/creatures/name { name }` — nommage.
- `GET /api/steps?days=14` — `{ date, today, history }` ; `POST /api/steps { steps }` — saisie du jour + effets (`gains`, `creature`).

Phase 3 :
- `POST /api/meals` (multipart `image`) — analyse + effets : `{ meal, analysis, effects, before, creature, mealsToday }` ; erreurs `meal_limit` (429), `duplicate_meal` (409), `not_food` (422), `creature_dead` (409), `ai_unavailable` (503).
- `GET /api/meals` — `{ meals, stats }` (URLs presignées 1 h).
- `POST /api/creatures/mourn` — accuse réception d'un décès.

Phase 4 (admin) :
- `POST /api/admin/login` / `POST /api/admin/logout` — cookie signé.
- `GET /api/admin/settings` — `{ rules, stored }` ; `PUT /api/admin/settings { patch } | { reset: true }`.

Phases suivantes (brief § 7) : `play`, `accessories`, `friends`, `shop/checkout`, `webhooks/stripe`, `inventory/use`, `strava/*`, `account`.

## 6. Design

- Thème sombre premium : noirs profonds (`ink-*`), verts sauge (`sage-*`), accents laiton (`brass-*`), texte crème. Tokens dans `app/globals.css` (`@theme`).
- Typographie : Fraunces (titres) + Manrope (texte), servies par `next/font` (auto-hébergées au build).
- Mobile-first, largeur max 28 rem, boutons ≥ 44 px, champs à 16 px (pas de zoom iOS), `safe-area` iOS, `prefers-reduced-motion` respecté globalement.
- Navigation par barre basse : Créature · Repas · Activité · Amis · Plus.

## 7. Phases

1. **Socle** : Next.js, Tailwind, thème, PWA, Better Auth, Drizzle, `db/init.sql`, `.env.example`, README, landing, inscription/connexion, onboarding pseudo, onglets avec états « bientôt », page Plus (profil, code ami, état des services, déconnexion).
2. **Œuf & éclosion** : choix de l'œuf (3 cartes, silhouettes, compteurs par rareté), incubation (œuf par niveau, jauge, saisie des pas), éclosion animée, tirage, nommage, 10 espèces faciles × 4 stades × 4 états, accueil créature, page Activité (historique 14 jours), `/dev/creatures`, `/dev/screens`.
3. Nourrir. 4. Vie & mort. 5. Jouer & accessoires (60 espèces). 6. Amis. 7. Boutique Stripe. 8. Strava. 9. Finitions.

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
| D16 | Niveaux « moyen » et « difficile » verrouillés tant qu'ils n'ont pas d'espèces (phase 5) | Un œuf qui ne peut pas éclore serait frustrant ; la carte reste visible avec « Bientôt ». |
| D17 | `egg_steps` recalculé (somme depuis le jour du choix) plutôt qu'incrémenté | La saisie du jour est modifiable ; une somme est toujours juste, un compteur dérive. |
| D18 | `step_entries.credited_steps` pour les effets de marche sur la créature | Rend l'édition idempotente (jamais deux crédits pour les mêmes pas) sans table supplémentaire. |
| D19 | Tirage de secours vers une rareté inférieure si le niveau est incomplet | Permet de jouer le niveau facile avec 10 espèces avant l'arrivée des 20 ; les probabilités redeviennent exactes à roster complet. |
| D20 | Éclosion déclenchée par l'utilisateur (bouton « Faire éclore ») plutôt qu'automatique | Il vit l'animation et la révélation ; l'API refuse si le seuil n'est pas atteint. |
| D21 | Tick livré avec le nourrissage (phase 3) | Sans nourrissage, une créature se dégraderait sans recours ; les deux arrivent ensemble. |
| D22 | Choix du modèle Gemini à l'exécution via l'API `models` (dernier `gemini-X.Y-flash` stable), `GEMINI_MODEL` prioritaire, chaîne de repli statique | La doc n'était pas accessible depuis l'environnement de développement ; la détection en direct suit les mises à jour de Google sans redéploiement. |
| D23 | Analyse avant stockage : une photo « pas un repas » n'est jamais enregistrée | Économise R2 et respecte l'esprit « les photos ne servent qu'à l'analyse ». |
| D24 | Limite « 5 repas / jour » et statistiques calculées en SQL sur la date Paris (`at time zone`) | Une seule source de vérité pour la journée, cohérente entre Neon et PGlite. |
| D25 | Les niveaux moyen et difficile deviennent jouables avec 10 espèces chacun ; le tirage se replie sur une rareté inférieure tant que le roster n'est pas complet | Demande du propriétaire ; les 30 espèces restantes arrivent en phase 5. |
| D26 | Écran de deuil bloquant (une fois), puis choix libre du niveau | Donne du poids à la mort sans punir ; `mourned_at` évite de le revoir. |
| D27 | Admin par identifiants en variables Vercel + cookie HMAC, sans table ni Better Auth | Un seul administrateur, zéro configuration hors Vercel, révocation en changeant le mot de passe. |
| D28 | Règles en une ligne jsonb de surcharges, fusionnées sur les défauts du code | Les défauts restent versionnés dans `config.ts` ; le jsonb ne stocke que ce qui change et survit aux ajouts de paramètres. |
| D29 | Cache des règles 60 s par instance | Évite une lecture Neon à chaque tick ; un délai d'une minute est acceptable pour des réglages de jeu. |
