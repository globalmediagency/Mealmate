# MealMate

Un Tamagotchi pour adultes, nourri avec des **photos de tes vrais repas** analysées par IA.
Application web mobile-first (PWA) — prototype d'un futur objet physique.

Tout se pilote depuis un navigateur : GitHub, Vercel, Neon, Cloudflare R2, Google AI Studio,
Stripe, Strava. Aucune installation locale n'est nécessaire.

- Architecture et décisions : [`SPEC.md`](./SPEC.md)
- Conventions de code : [`CLAUDE.md`](./CLAUDE.md)
- Variables d'environnement : [`.env.example`](./.env.example)
- Schéma SQL : [`db/init.sql`](./db/init.sql) puis [`db/migrations/`](./db/migrations/)

---

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
2. Vercel → `GEMINI_API_KEY` → Redeploy. (`GEMINI_MODEL` est optionnel.)

### Stripe — boutique en mode test (phase 7)

1. <https://dashboard.stripe.com> → active le **mode test** (interrupteur en haut à droite).
2. **Developers → API keys** → copie la **Secret key** (`sk_test_…`) → Vercel `STRIPE_SECRET_KEY`.
3. **Developers → Webhooks → Add endpoint** : URL `https://TON-URL/api/webhooks/stripe`,
   événement `checkout.session.completed` → copie le **Signing secret** (`whsec_…`) → Vercel `STRIPE_WEBHOOK_SECRET`.
4. Redeploy. Cartes de test : `4242 4242 4242 4242`, date future, CVC quelconque.

> ⚠️ Le plan **Vercel Hobby interdit l'usage commercial**. Avant d'encaisser de vrais paiements,
> passe le projet en plan **Pro** et remplace les clés Stripe de test par les clés réelles.

### Strava — import d'activités (phase 8)

1. <https://www.strava.com/settings/api> → **Create an app** : nom `MealMate`, site `https://TON-URL`,
   **Authorization Callback Domain** = ton domaine sans `https://` (ex. `mealmate.vercel.app`).
2. Copie **Client ID** et **Client Secret** → Vercel `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET` → Redeploy.

### Galerie de design des créatures (phase 2)

Vercel → `NEXT_PUBLIC_DEV_GALLERY=true` (Preview uniquement, par exemple) → la page `/dev/creatures`
affiche toutes les espèces × stades × états.

---

## 4. Scripts (pour information)

| Commande | Rôle |
|---|---|
| `npm run build` | Build de production (ne dépend d'aucune variable d'environnement) |
| `npm run lint` | ESLint |
| `npm run typecheck` | Vérification TypeScript |
| `npm test` | Tests unitaires et d'intégration (`vitest`, base Postgres embarquée PGlite) |

Vercel exécute `npm run build` à chaque push.
