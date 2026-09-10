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
- Règles réglables depuis `/admin` : les fonctions pures prennent `rules: GameRules` (défaut `DEFAULT_RULES`) ; côté serveur, toujours charger `await getGameRules()` (`lib/game/rules-service.ts`) et le passer explicitement (`applyTick`, `toCreatureView`, `mealEffects`, `hatchProgress`). Ne jamais lire `TIER_CONFIG` pour une valeur numérique à l'exécution, seulement pour les libellés.
- UI : composants dans `components/`, classes Tailwind avec `cn()`. Tokens de couleur : `ink-*`, `sage-*`, `brass-*`, `cream-*`, `health`, `hunger`, `mood`, `danger`. Titres en `font-display`.
- Accessibilité : boutons ≥ 44 px, champs `text-base`, `aria-*` sur les icônes décoratives, animations coupées par `prefers-reduced-motion` (déjà global dans `globals.css`).
- Textes utilisateur : ton bienveillant, tutoiement, jamais culpabilisant.

## Ajouter une espèce

1. Ouvrir `lib/creatures/species/<tier>.ts` et ajouter un objet `Species` : `id` préfixé par le niveau (`facile-…`), `rarity`, `name` unique, `tagline` (une phrase, ton bienveillant), `palette` (`primary`, `secondary`, `accent`, `eye`), `parts` (`body`, `ears`, `eyes`, `mouth`, `tail`, `markings`, `extra`), `anchors` (`DEFAULT_ANCHORS[body]` sauf besoin particulier), `signature` (objet porté au stade Sage). Les `extra` (ailes, halo, cristaux, flammes, aura) sont réservés aux très rares / légendaires. Quota par niveau : 9 communs, 6 rares, 4 très rares, 1 légendaire.
2. Si une nouvelle part est nécessaire : ajouter le type dans `lib/creatures/types.ts`, le dessin dans le fichier de `components/creatures/parts/` concerné (coordonnées relatives à l'ancre, viewBox 100×100, corps ancré sur la ligne de sol y≈92), et si besoin une nouvelle silhouette dans `components/creatures/layout.ts`.
3. Vérifier dans `/dev/creatures?species=<id>` (`NEXT_PUBLIC_DEV_GALLERY=true`) sur les 4 stades × 4 états + silhouette. Les animations n'utilisent que `transform` avec `transform-box: fill-box`.
4. Lancer `npm test` : `lib/creatures/species.test.ts` vérifie quotas, unicité et réservation des extras.

## Pages de validation visuelle

- `/dev/creatures` : galerie espèces × stades × états, œufs et décors.
- `/dev/screens?screen=…` : écrans du jeu avec données factices (`egg`, `incubation`, `ready`, `reveal`, `home`, `home-sick`, `home-hungry`, `activity`, `feed`, `meal-result`, `meals`, `mourning`, `admin`, `play`, `wardrobe`, `chest`, `collection`, `friends`, `shop`, `home-protected`, `account`).
- `/dev/creatures?compact=1` : les 60 espèces en un coup d'œil ; la page complète montre les 30 accessoires. `/dev/gemini` : modèles Gemini visibles avec la clé.
- `/admin` (hors galerie) : espace d'administration protégé par `ADMIN_USERNAME` / `ADMIN_PASSWORD` (aussi acceptés sur la page de connexion normale ; l'identifiant est réservé via `isAdminIdentifier()`), avec les onglets Règles de jeu, Créatures (`/admin/creatures`, filtres niveau / rareté, fiche stades × états) et Accessoires (`/admin/accessoires`, par emplacement, aperçu porté à chaque stade).
- Les deux sont gardées par `NEXT_PUBLIC_DEV_GALLERY=true` (lue au build : redéployer après l'avoir changée).

## Ajouter un accessoire

1. Ajouter l'entrée dans `lib/accessories/catalog.ts` (`id`, `name`, `slot` ∈ `head | eyes | neck | body`, `rarity`, `tagline`).
2. Dessiner le SVG dans le fichier de `components/accessories/` du slot (`head.tsx`, `eyes.tsx`, `neck.tsx`, `body.tsx`) : un objet `{ front?, back? }` dont les coordonnées sont relatives à l'ancre (tête = sommet du crâne, y vers le bas ; yeux = centre de la ligne des yeux, verres à x = ±9 ; cou = base de la tête ; corps = centre du corps). `back` est dessiné derrière le corps (cape, ailes, sac).
3. Contrôler sur `/dev/creatures` (section « Accessoires » + « Portés ») sur plusieurs silhouettes et stades. Le test `lib/game/accessories.test.ts` vérifie qu'un rendu existe pour chaque entrée du catalogue.

## Mini-jeu et coffres

- Le jeu (`components/game/food-catch-game.tsx`) ne passe pas par l'état React à chaque frame : positions écrites directement dans `style.transform` depuis `requestAnimationFrame`, éléments recyclés (pool). Garder cette discipline pour rester à 60 fps sur mobile.
- Le serveur recalcule le score (`computePlayScore`) à partir des compteurs bruts : ne jamais faire confiance à un score client.
- Coffres : `getChestStatus(creature)` (somme des pas depuis l'éclosion − `accessory_drops`), `openChest()` réserve le coffre par `UPDATE` conditionnel avant le tirage.

## Amis

- Tout ce qu'un ami peut voir passe par `FriendCreatureView` (`lib/friends/service.ts`) : ne jamais renvoyer une `CreatureView` complète ni un profil complet (code ami, email) à un autre utilisateur.
- Les lectures de créatures d'amis appliquent le tick (`tickCreature`) : c'est voulu, l'état affiché doit être le vrai.

## Boutique, soins et trocs

- Prix et libellés des soins : `SHOP_ITEMS` dans `lib/game/config.ts` ; effets purs dans `lib/game/medicine.ts` (`applyMedicine`, `needsCare`) avec test à côté.
- Stripe : client paresseux `getStripe()` (`lib/payments/stripe.ts`). Le service `lib/shop/service.ts` reçoit un `CheckoutProvider` injecté (`stripeProvider` en prod, faux fournisseur dans `lib/shop/shop.integration.test.ts`). Toujours créditer via `creditPurchase()` (idempotent) : jamais d'`INSERT` direct dans `inventory` depuis une route.
- Le webhook `app/api/webhooks/stripe/route.ts` lit le corps **brut** (`request.text()`) avant `constructEvent` : ne pas le parser en JSON avant.
- Décrémenter l'inventaire uniquement par `UPDATE … WHERE qty > 0` (`consumeDose`).
- Soins aux amis : passer par `healFriendCreature()` (ami accepté, créature vivante et `needsCare`), qui applique le tick avant d'agir et journalise dans `gifts`.
- Trocs : `lib/trades/service.ts`. L'acceptation bascule d'abord le statut par `UPDATE` conditionnel puis échange les lignes `user_accessories` et retire les accessoires des tenues. Ne jamais échanger sans cette bascule.

## Strava

- Client dans `lib/strava/api.ts` (interface `StravaApi`, implémentation `stravaApi` avec `requireEnv` à l'appel) ; le service `lib/strava/service.ts` reçoit l'API injectée, les tests (`strava.integration.test.ts`) utilisent une fausse API.
- Conversion activité → pas et fenêtre / throttle : `lib/game/strava.ts` (constantes dans `STEPS.strava`), test à côté.
- Le `state` OAuth est signé (`lib/strava/state.ts`) et vérifié contre `session.user.id` dans le callback : ne jamais accepter un callback sans session ni `state` valide.
- Les jetons ne sortent jamais du serveur : renvoyer `StravaStatus`, jamais la ligne `strava_connections`.
- Import idempotent par `ON CONFLICT (strava_activity_id) DO NOTHING` ; crédit à la créature **par jour toutes sources** via `creditDays()` (jamais par activité).
- Le bouton « Connecter Strava » est une balise `<a href="/api/strava/connect">` (pas `Link`) : la route répond par une redirection externe.

## Compte (export, suppression)

- `lib/account/service.ts` : `exportAccount()` (jamais de clé d'image ni d'identifiant d'un autre utilisateur, seulement des pseudos) et `purgeExternalData()` (préfixe R2 `meals/<userId>/` + révocation Strava). La suppression passe par `deleteUser` de Better Auth (`lib/auth/index.ts`, hook `beforeDelete`) ; tout le reste est en `ON DELETE CASCADE` : toute nouvelle table liée à un utilisateur **doit** référencer `"user"(id) ON DELETE CASCADE` et être ajoutée à `countUserFootprint()` pour le test.
- En-têtes de sécurité dans `next.config.ts` ; pages privées en `robots: noindex` via les layouts `(app)`, `admin`, `dev`.
- Accessibilité : cibles ≥ 44 px (`min-h-11` / `h-11 w-11`, avec marge négative pour les icônes de fermeture), focus global dans `globals.css`, lien d'évitement `.skip-link` dans le layout `(app)`.

## Nourrissage et IA

- Toute lecture d'une créature vivante passe par `getActiveCreatureTicked()` (tick paresseux). Ne jamais lire `creatures` directement pour afficher des stats.
- `feedCreature()` reçoit `analyzer` et `storage` injectés : les tests utilisent un faux analyseur et un stockage en mémoire (`lib/meals/meals.integration.test.ts`). Le vrai couple est `analyzeMealWithGemini` + `r2Storage`.
- Le prompt Gemini vit dans `lib/ai/meal-prompt.ts` ; le contrat JSON dans `lib/ai/meal-schema.ts` (zod, normalisation tolérante). Toujours garder les deux alignés (y compris `photo_source`, qui alimente `meals.photo_source` et la règle admin `feeding.rejectScreenPhotos`).
- Prise de photo : un seul `<input capture="environment">`, pas de bouton « galerie » (friction anti-triche voulue ; sur ordinateur le navigateur affiche quand même un sélecteur de fichiers, la vraie protection est `photo_source` + la règle admin).
- Les photos ne sont jamais servies en direct : `signedUrl()` (1 h) à chaque lecture.

## Points d'attention

- Vercel Hobby : pas de WebSocket, pas de cron fiable → toute logique temporelle est calculée paresseusement à la lecture (`lib/game/tick.ts`).
- Ne jamais lancer `pkill -f "next dev"` depuis une commande dont la ligne contient elle-même « next dev » (elle se tuerait) : utiliser un motif avec crochets (`"next de[v]"`) ou tuer par port.
- Better Auth utilise un `baseURL` dynamique (`*.vercel.app` autorisé) : ne pas définir `BETTER_AUTH_URL`.
- Neon HTTP ne supporte pas `db.transaction()` : utiliser `db.batch()` ou des mises à jour conditionnelles.
- Les photos de repas sont privées : bucket R2 privé, presigned GET courts, jamais exposées aux amis.
