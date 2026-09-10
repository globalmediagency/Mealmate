# MealMate

Un compagnon qui grandit avec tes vrais repas : tu photographies ce que tu manges, une IA note
l'assiette, ta créature en profite (ou pas). Tu la fais marcher avec tes pas (saisie manuelle ou
Strava), tu joues avec elle, tu l'habilles avec les accessoires gagnés en marchant, tu la montres à
tes amis, tu la soignes… et si tu l'oublies trop longtemps, elle meurt.

Ce dépôt se pilote **entièrement depuis un navigateur** : GitHub, Vercel, Neon, Cloudflare R2,
Google AI Studio, Stripe, Strava. Aucune installation locale n'est nécessaire.

- Spécification et décisions : [`SPEC.md`](./SPEC.md)
- Repères pour modifier le code : [`CLAUDE.md`](./CLAUDE.md)
- Schéma SQL : [`db/init.sql`](./db/init.sql) puis [`db/migrations/`](./db/migrations/)

## 0. Résumé des variables et migrations

| Variable Vercel | Obligatoire | Sert à |
|---|---|---|
| `DATABASE_URL` | oui | Neon Postgres |
| `BETTER_AUTH_SECRET` | oui | Signature des sessions, du `state` Strava et de l'espace admin |
| `APP_URL` | recommandé | URL de production (hôte autorisé pour l'auth, repli des redirections) |
| `AUTH_ALLOWED_HOSTS` | non | Hôtes supplémentaires autorisés pour l'auth, séparés par des virgules |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | non | Connexion Google |
| `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET` | pour nourrir | Photos de repas (bucket privé) |
| `GEMINI_API_KEY` (+ `GEMINI_MODEL`) | pour nourrir | Analyse des repas |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | pour `/admin` | Réglage des exigences des créatures |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | pour la boutique | Paiements de test |
| `STRAVA_CLIENT_ID` / `STRAVA_CLIENT_SECRET` | pour Strava | Import d'activités |
| `NEXT_PUBLIC_DEV_GALLERY` | non | `true` pour ouvrir `/dev/creatures` et `/dev/screens` (lue au build) |
| `NEXT_PUBLIC_CONTACT_EMAIL` | non | Adresse affichée dans les mentions légales |

Sans variable, le build passe et chaque écran explique ce qui manque au lieu de planter.

Migrations à coller dans **Neon → SQL Editor**, dans l'ordre, si `db/init.sql` a été exécuté avant la
phase correspondante (un `init.sql` récent les contient déjà) : `001` pas crédités, `002` deuil,
`003` règles admin, `004` coffres, `005` cadeaux et trocs, `006` prénom Strava.

## 1. Mise en route (phase 1 : compte et connexion)

### Étape A — Base de données Neon

1. Va sur <https://console.neon.tech> et connecte-toi.
2. **New Project** → nom `mealmate`, région **Europe (Frankfurt)** de préférence → **Create project**.
3. Dans le menu de gauche, ouvre **SQL Editor**.
4. Ouvre le fichier [`db/init.sql`](./db/init.sql) sur GitHub, clique sur **Raw**, copie tout le contenu.
5. Colle-le dans l'éditeur SQL de Neon et clique sur **Run**. Le script est idempotent : tu peux le relancer sans risque.
6. Retourne sur **Dashboard** (ou **Connect**) → bloc **Connection string** :
   - choisis **Pooled connection** (l'hôte contient `-pooler`),
   - clique sur l'icône pour afficher le mot de passe,
   - copie la chaîne complète `postgresql://…?sslmode=require`. C'est ta `DATABASE_URL`.

### Étape B — Secret d'authentification

1. Ouvre <https://generate-secret.vercel.app/32> (ou n'importe quel générateur de chaîne aléatoire).
2. Copie la valeur : c'est ta `BETTER_AUTH_SECRET` (32 caractères minimum). Ne la partage jamais.

### Étape C — Déploiement Vercel

1. Va sur <https://vercel.com/new> et connecte ton compte GitHub si ce n'est pas fait.
2. **Import** le dépôt `globalmediagency/Mealmate`. Framework détecté : **Next.js** (ne rien changer).
3. Déplie **Environment Variables** et ajoute :

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | la chaîne copiée à l'étape A |
   | `BETTER_AUTH_SECRET` | le secret de l'étape B |

   Pour chaque variable, laisse cochés **Production**, **Preview** et **Development**.
4. Clique sur **Deploy**. Le build passe même si une variable manque : dans ce cas l'app affiche
   « Configuration incomplète » avec le nom de la variable à ajouter.
5. Une fois déployé, copie l'URL de production (ex. `https://mealmate.vercel.app`) puis, dans
   **Project → Settings → Environment Variables**, ajoute `APP_URL` = cette URL (sans slash final).
   Puis **Deployments → ⋯ → Redeploy** sur le dernier déploiement.

### Étape D — Vérifier

1. Ouvre l'URL de production sur ton téléphone.
2. **Créer mon compte** → pseudo, email, mot de passe (8 caractères min.) → tu arrives sur l'onglet **Créature**.
3. Onglet **Plus** : ton pseudo, ton **code ami** (`MM-XXXXXX`) et l'**état des services** (ce qui est configuré).
4. Déconnexion / reconnexion depuis **Plus → Se déconnecter** puis **Se connecter**.
5. Installer l'app : iPhone → Partager → **Sur l'écran d'accueil** ; Android → menu → **Installer l'application**.

Diagnostic rapide : `https://TON-URL/api/health` renvoie les services configurés (aucun secret).

---

### Étape E — Migrations des phases suivantes

Si tu avais déjà exécuté `db/init.sql` avant une phase, colle ses migrations dans
**Neon → SQL Editor** → **Run**, dans l'ordre (elles sont idempotentes) :

- phase 2 : [`db/migrations/001_step_entries_credited_steps.sql`](./db/migrations/001_step_entries_credited_steps.sql)
- phase 3 : [`db/migrations/002_creatures_mourned_at.sql`](./db/migrations/002_creatures_mourned_at.sql)
- phase 4 : [`db/migrations/003_game_settings.sql`](./db/migrations/003_game_settings.sql)
- phase 5 : [`db/migrations/004_creatures_accessory_drops.sql`](./db/migrations/004_creatures_accessory_drops.sql)
- phase 7 : [`db/migrations/005_gifts_trades.sql`](./db/migrations/005_gifts_trades.sql)
- phase 8 : [`db/migrations/006_strava_athlete_name.sql`](./db/migrations/006_strava_athlete_name.sql)

Un `init.sql` fraîchement exécuté contient déjà toutes ces colonnes.

### Étape F — Nourrir (phase 3) : Cloudflare R2 + Google Gemini

Sans ces variables, l'onglet **Repas** et l'écran **Nourrir** affichent « Configuration incomplète » ; le reste
de l'app fonctionne. Attention : dès la phase 3, une créature vivante a faim avec le temps et peut tomber malade
puis mourir si elle n'est jamais nourrie (voir `SPEC.md` § 3.8).

1. **R2** : suis la section « Cloudflare R2 » ci-dessous (4 variables).
2. **Gemini** : suis la section « Google Gemini » ci-dessous (1 variable, `GEMINI_MODEL` optionnel).
3. Vercel → **Redeploy**, puis onglet Créature → **Nourrir** → prends une photo de ton assiette.

### Étape G — Espace admin (phase 4)

1. Vercel → **Environment Variables** : `ADMIN_USERNAME` (ex. `chef`) et `ADMIN_PASSWORD` (long et unique) → Redeploy.
2. Ouvre `https://TON-URL/admin` → connecte-toi.
3. Règle l'exigence des créatures par niveau (pas pour éclore, seuil repas sain, faim/heure, perte de santé/heure,
   perte d'humeur/heure, jours malade avant la mort) et les règles communes (seuil de faim critique, repas max/jour,
   ralentissement après absence). La simulation en bas de page montre en combien de temps une créature jamais
   nourrie tombe malade puis meurt.
4. **Enregistrer** : effet immédiat pour toi, au plus tard une minute après pour les autres (cache serveur).
   **Valeurs par défaut** restaure les constantes du code.

Prérequis : la migration `db/migrations/003_game_settings.sql` (voir étape E). Sans elle, l'app continue avec les
valeurs par défaut et l'admin affiche une erreur à l'enregistrement.

### Étape H — Jouer et accessoires (phase 5)

Rien à configurer : après la migration 004, l'accueil propose **Jouer** (3 parties par jour, 20 secondes) et
**Habiller** (garde-robe). Chaque tranche de 5 000 pas depuis l'éclosion donne un coffre à ouvrir dans l'onglet
**Activité**. La **Collection** (60 créatures) est dans l'onglet Plus.

### Étape I — Amis (phase 6)

Rien à configurer. Onglet **Amis** : ton code ami (`MM-XXXXXX`) et ton pseudo, un champ pour ajouter un proche par
code ou pseudo exact, les demandes reçues / envoyées, puis les cartes de tes amis avec leur créature animée.
Une pastille sur l'onglet indique les demandes reçues.

## 2. Cycle de travail

1. Chaque phase arrive dans une **pull request** sur GitHub, avec sa checklist d'actions manuelles.
2. Vercel crée automatiquement une **URL de preview** par PR (visible dans la PR, commentaire « Vercel »).
   L'authentification fonctionne sur toutes les URL `*.vercel.app` sans réglage supplémentaire.
3. Teste sur la preview, puis **Merge** la PR : la production se redéploie toute seule.
4. Si la PR contient un fichier `db/migrations/NNN_*.sql`, colle-le dans **Neon → SQL Editor** → **Run**
   **avant** de tester la preview.

---

## 3. Services optionnels (à activer quand la phase correspondante arrive)

### Connexion Google (optionnelle, dès maintenant)

1. <https://console.cloud.google.com> → crée un projet `MealMate`.
2. **APIs & Services → OAuth consent screen** : type **External**, nom `MealMate`, ton email, **Save**.
   Ajoute ton adresse dans **Test users** tant que l'app n'est pas publiée.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID** :
   - Application type : **Web application**
   - Authorized JavaScript origins : `https://TON-URL`
   - Authorized redirect URIs : `https://TON-URL/api/auth/callback/google`
4. Copie **Client ID** et **Client secret** → Vercel → `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` → Redeploy.
5. Le bouton « Continuer avec Google » apparaît automatiquement. Il ne fonctionne que sur les URL
   déclarées dans Google (la production ; ajoute une URL de preview si besoin).

### Cloudflare R2 — photos de repas (phase 3)

1. <https://dash.cloudflare.com> → **R2 Object Storage** → **Create bucket** → nom `mealmate`, laisse le bucket **privé**.
2. **Manage R2 API Tokens → Create API token** : permissions **Object Read & Write**, limité au bucket `mealmate`.
3. Copie **Access Key ID**, **Secret Access Key** et l'**Account ID** (visible dans l'URL du dashboard ou dans **R2 → Overview**).
4. Vercel → `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET=mealmate` → Redeploy.

### Google Gemini — analyse des repas (phase 3)

1. <https://aistudio.google.com> → **Get API key** → **Create API key**.
2. Vercel → `GEMINI_API_KEY` → Redeploy.
3. Modèle : par défaut l'app détecte le dernier `gemini-X.Y-flash` stable disponible pour ta clé (repli
   `gemini-3.8-flash` → `gemini-3.6-flash` → `gemini-3.5-flash-lite` → `gemini-2.5-flash`). Pour forcer un
   modèle : `GEMINI_MODEL=gemini-3.6-flash` par exemple. Avec `NEXT_PUBLIC_DEV_GALLERY=true`, la page
   `/dev/gemini` liste les modèles visibles et l'ordre d'essai.

### Stripe — boutique en mode test (phase 7)

Prérequis : la migration [`db/migrations/005_gifts_trades.sql`](./db/migrations/005_gifts_trades.sql)
(tables `gifts` et `trades`, voir étape E). Sans clé Stripe, la page **Boutique** reste visible mais les
boutons d'achat sont désactivés ; l'armoire à pharmacie, les soins aux amis et les trocs fonctionnent
quand même (ils n'ont pas besoin de Stripe).

1. <https://dashboard.stripe.com> → active le **mode test** (interrupteur en haut à droite).
2. **Developers → API keys** → copie la **Secret key** (`sk_test_…`) → Vercel `STRIPE_SECRET_KEY`.
3. **Developers → Webhooks → Add endpoint** : URL `https://TON-URL/api/webhooks/stripe`
   (une par domaine : production **et** preview si tu veux tester dessus), événements
   `checkout.session.completed` et `checkout.session.async_payment_succeeded` → copie le
   **Signing secret** (`whsec_…`) → Vercel `STRIPE_WEBHOOK_SECRET`.
   Sans cette variable, l'achat est quand même crédité au retour sur la page Boutique (repli), mais
   pas si tu fermes l'onglet Stripe avant de revenir.
4. Redeploy. Cartes de test : `4242 4242 4242 4242`, date future, CVC quelconque.
5. Vérification : **Plus → Boutique** → acheter un sirop → payer avec la carte de test → retour sur
   la boutique avec « Merci ! Sirop est dans ton armoire à pharmacie » ; dans Stripe → **Payments** la
   ligne apparaît, et dans **Webhooks** la livraison est en `200`.

Ce que la phase 7 ajoute côté jeu :

- **Soigner** sur l'écran créature ouvre la boutique ; les soins achetés s'utilisent depuis l'armoire
  (sirop +30 santé, antibiotique santé 100 et fin de maladie, talisman 7 jours sans risque de mort).
- Onglet **Amis** : bouton **Soigner** sur un ami dont la créature est fatiguée ou malade (envoie une
  dose de ton armoire), bouton **Échanger** pour troquer un de tes accessoires contre un des siens ;
  l'ami accepte ou refuse depuis la section « Trocs d'accessoires ».

> ⚠️ Le plan **Vercel Hobby interdit l'usage commercial**. Avant d'encaisser de vrais paiements,
> passe le projet en plan **Pro** et remplace les clés Stripe de test par les clés réelles.

### Strava — import d'activités (phase 8)

Prérequis : la migration [`db/migrations/006_strava_athlete_name.sql`](./db/migrations/006_strava_athlete_name.sql)
(voir étape E).

1. <https://www.strava.com/settings/api> → **Create an app** : nom `MealMate`, catégorie « Training »,
   site `https://TON-URL`, **Authorization Callback Domain** = ton domaine **sans** `https://` ni chemin
   (ex. `mealmate.vercel.app`). Strava n'accepte qu'un seul domaine : mets celui de production. Pour
   tester sur une preview, remplace-le temporairement par le domaine de la preview.
2. Copie **Client ID** et **Client Secret** → Vercel `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET` → Redeploy.
3. Vérification : **Activité → Connecter Strava** → écran Strava → coche « Voir les données de tes
   activités » (lecture, y compris privées) → **Autoriser** → retour sur Activité avec « Strava est
   connecté ! » → **Synchroniser** : les courses, marches, randos et sorties vélo des 30 derniers jours
   apparaissent (1 km à pied ≈ 1 300 pas, 1 km à vélo ≈ 400 pas, autres sports 100 pas par minute).
4. Limites : une synchronisation manuelle toutes les 5 minutes ; l'app Strava en mode test est limitée
   à un seul athlète (le tien) tant qu'elle n'est pas validée par Strava.

Ce que Strava voit : uniquement une demande de lecture des activités. Ce que MealMate garde : les jetons
d'accès côté serveur (jamais envoyés au navigateur), ton prénom Strava, et les pas convertis. **Déconnecter
Strava** révoque l'accès chez Strava et efface les jetons ; les pas déjà importés restent.

### Galeries de design (phase 2)

Vercel → `NEXT_PUBLIC_DEV_GALLERY=true` (sur Preview et/ou Production) → Redeploy. Deux pages
apparaissent alors, sans connexion nécessaire :

- `/dev/creatures` : toutes les espèces × 4 stades × 4 états (+ silhouettes, œufs, décors).
- `/dev/screens?screen=egg|incubation|ready|reveal|home|home-sick|home-hungry|activity|feed|meal-result|meals|mourning|admin|play|wardrobe|chest|collection|friends` :
  les écrans du jeu avec des données factices, pour valider le design depuis un téléphone.
- `/dev/creatures?compact=1` : vue d'ensemble des 60 espèces (adulte, en forme) ; la page complète montre aussi les 30 accessoires.
- `/dev/gemini` : modèles Gemini visibles avec ta clé.

---

## 4. Tester l'application en dix minutes

1. **Compte** : inscription email + mot de passe (ou Google), choix du pseudo, code ami affiché dans Plus.
2. **Œuf** : choisis un niveau, ajoute des pas dans Activité (chaque saisie s'ajoute au total du jour ; 15 000 en
   tout, sur un ou plusieurs jours), appuie sur
   **Faire éclore** dès que la jauge est pleine, nomme la créature.
3. **Nourrir** : photographie un repas (R2 + Gemini configurés) ; la note, les aliments reconnus et
   l'effet sur la santé s'affichent. Trois repas par jour maximum (réglable dans `/admin`).
4. **Vie** : laisse passer quelques heures sans nourrir : la faim monte, puis la santé baisse, la
   créature devient fatiguée puis malade ; l'accueil affiche le nombre de jours restants. Un repas
   sain ou un soin la remet d'aplomb ; sinon elle meurt et rejoint le cimetière.
5. **Jouer et accessoires** : trois parties de 20 s par jour ; un coffre d'accessoire tous les
   5 000 pas, à ouvrir dans Activité, à porter dans la garde-robe.
6. **Amis** : ajoute un second compte par code ami ; soigne sa créature malade, propose un troc.
7. **Boutique** : carte de test Stripe `4242 4242 4242 4242`.
8. **Strava** : connecte ton compte, synchronise.
9. **Plus → Mes données** : export JSON, suppression du compte (photos et lien Strava compris).

## 5. Limites connues

- **Vercel Hobby** : usage non commercial uniquement (la boutique reste en mode test), pas de tâche
  planifiée ni de WebSocket : tout ce qui dépend du temps (faim, maladie, mort) est calculé à la
  lecture, ce qui donne exactement le même résultat qu'un calcul en continu.
- **Strava** : un seul domaine de callback par application ; l'application non validée n'accepte
  que ton propre compte.
- **Podomètre** : pas d'accès au capteur du téléphone depuis une PWA ; la saisie manuelle et Strava
  sont les deux sources de pas.
- **Gemini** : quota gratuit limité ; en cas d'erreur, le repas n'est pas compté et un message
  l'explique.

## 6. Scripts (pour information)

| Commande | Rôle |
|---|---|
| `npm run build` | Build de production (ne dépend d'aucune variable d'environnement) |
| `npm run lint` | ESLint |
| `npm run typecheck` | Vérification TypeScript |
| `npm test` | Tests unitaires et d'intégration (`vitest`, base Postgres embarquée PGlite) |

Vercel exécute `npm run build` à chaque push.
