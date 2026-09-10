-- ============================================================================
-- MealMate — initial schema (idempotent).
-- Paste the whole file in Neon → your project → "SQL Editor" → Run.
-- Safe to run several times: every statement uses IF NOT EXISTS.
-- Keep strictly in sync with lib/db/schema.ts.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Better Auth core tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "user" (
  id             text PRIMARY KEY,
  name           text NOT NULL,
  email          text NOT NULL UNIQUE,
  email_verified boolean NOT NULL DEFAULT false,
  image          text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "session" (
  id         text PRIMARY KEY,
  expires_at timestamptz NOT NULL,
  token      text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  ip_address text,
  user_agent text,
  user_id    text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS session_user_id_idx ON "session"(user_id);

CREATE TABLE IF NOT EXISTS "account" (
  id                       text PRIMARY KEY,
  account_id               text NOT NULL,
  provider_id              text NOT NULL,
  user_id                  text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  access_token             text,
  refresh_token            text,
  id_token                 text,
  access_token_expires_at  timestamptz,
  refresh_token_expires_at timestamptz,
  scope                    text,
  password                 text,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS account_user_id_idx ON "account"(user_id);

CREATE TABLE IF NOT EXISTS "verification" (
  id         text PRIMARY KEY,
  identifier text NOT NULL,
  value      text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS verification_identifier_idx ON "verification"(identifier);

-- ---------------------------------------------------------------------------
-- Profiles (pseudo + friend code)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS profiles (
  user_id     text PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  username    text NOT NULL,
  friend_code text NOT NULL UNIQUE,
  created_at  timestamptz NOT NULL DEFAULT now()
);
-- Usernames are unique case-insensitively.
CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_lower_idx ON profiles (lower(username));

-- ---------------------------------------------------------------------------
-- Creatures (egg → alive → dead)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS creatures (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  tier            text NOT NULL,
  status          text NOT NULL DEFAULT 'egg',
  species_id      text,
  rarity          text,
  name            text,
  egg_steps       integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  hatched_at      timestamptz,
  health          double precision NOT NULL DEFAULT 100,
  hunger          double precision NOT NULL DEFAULT 0,
  mood            double precision NOT NULL DEFAULT 100,
  xp              integer NOT NULL DEFAULT 0,
  sick_since      timestamptz,
  protected_until timestamptz,
  last_tick_at    timestamptz NOT NULL DEFAULT now(),
  died_at         timestamptz,
  death_cause     text,
  lifespan_days   integer,
  mourned_at      timestamptz,
  accessory_drops integer NOT NULL DEFAULT 0,
  CONSTRAINT creatures_tier_check   CHECK (tier IN ('facile', 'moyen', 'difficile')),
  CONSTRAINT creatures_status_check CHECK (status IN ('egg', 'alive', 'dead'))
);
CREATE INDEX IF NOT EXISTS creatures_user_status_idx ON creatures (user_id, status);
-- A user has at most one egg or living creature at a time.
CREATE UNIQUE INDEX IF NOT EXISTS creatures_one_active_per_user_idx
  ON creatures (user_id) WHERE status IN ('egg', 'alive');

-- ---------------------------------------------------------------------------
-- Meals (photo analysed by Gemini)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS meals (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creature_id   uuid NOT NULL REFERENCES creatures(id) ON DELETE CASCADE,
  user_id       text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  image_key     text NOT NULL,
  image_hash    text NOT NULL,
  score         integer NOT NULL,
  verdict       text NOT NULL,
  foods         jsonb NOT NULL DEFAULT '[]'::jsonb,
  macros        jsonb NOT NULL DEFAULT '{}'::jsonb,
  portion       text,
  comment       text,
  creature_line text,
  health_delta  double precision NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS meals_user_created_idx     ON meals (user_id, created_at);
CREATE INDEX IF NOT EXISTS meals_creature_created_idx ON meals (creature_id, created_at);

-- ---------------------------------------------------------------------------
-- Steps (manual entry, Strava import, future pedometer)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS step_entries (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  date               date NOT NULL,
  steps              integer NOT NULL,
  source             text NOT NULL,
  strava_activity_id bigint UNIQUE,
  credited_steps     integer NOT NULL DEFAULT 0,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT step_entries_source_check CHECK (source IN ('manual', 'strava', 'pedometer'))
);
CREATE INDEX IF NOT EXISTS step_entries_user_date_idx ON step_entries (user_id, date);
-- One manual entry per user and day (editable). Strava may have several per day.
CREATE UNIQUE INDEX IF NOT EXISTS step_entries_manual_unique_idx
  ON step_entries (user_id, date, source) WHERE source = 'manual';

-- ---------------------------------------------------------------------------
-- Mini-game sessions
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS play_sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creature_id uuid NOT NULL REFERENCES creatures(id) ON DELETE CASCADE,
  user_id     text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  score       integer NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS play_sessions_creature_created_idx ON play_sessions (creature_id, created_at);

-- ---------------------------------------------------------------------------
-- Accessories
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS user_accessories (
  user_id      text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  accessory_id text NOT NULL,
  obtained_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, accessory_id)
);

CREATE TABLE IF NOT EXISTS creature_outfits (
  creature_id  uuid NOT NULL REFERENCES creatures(id) ON DELETE CASCADE,
  slot         text NOT NULL,
  accessory_id text NOT NULL,
  PRIMARY KEY (creature_id, slot),
  CONSTRAINT creature_outfits_slot_check CHECK (slot IN ('head', 'eyes', 'neck', 'body'))
);

-- ---------------------------------------------------------------------------
-- Friends
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS friendships (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  addressee_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  status       text NOT NULL DEFAULT 'pending',
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT friendships_not_self_check CHECK (requester_id <> addressee_id),
  CONSTRAINT friendships_status_check   CHECK (status IN ('pending', 'accepted'))
);
CREATE UNIQUE INDEX IF NOT EXISTS friendships_pair_idx      ON friendships (requester_id, addressee_id);
CREATE INDEX        IF NOT EXISTS friendships_addressee_idx ON friendships (addressee_id);

-- ---------------------------------------------------------------------------
-- Shop (Stripe) and inventory
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS purchases (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  stripe_session_id text NOT NULL UNIQUE,
  item              text NOT NULL,
  amount_cents      integer NOT NULL,
  status            text NOT NULL DEFAULT 'pending',
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS purchases_user_idx ON purchases (user_id);

CREATE TABLE IF NOT EXISTS inventory (
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  item    text NOT NULL,
  qty     integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, item)
);

-- ---------------------------------------------------------------------------
-- Entraide entre amis (phase 7) : cadeaux de médicaments et trocs d'accessoires
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS gifts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  to_user_id   text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  creature_id  uuid REFERENCES creatures(id) ON DELETE SET NULL,
  item         text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  seen_at      timestamptz,
  CONSTRAINT gifts_not_self_check CHECK (from_user_id <> to_user_id)
);
CREATE INDEX IF NOT EXISTS gifts_to_user_created_idx ON gifts (to_user_id, created_at);

CREATE TABLE IF NOT EXISTS trades (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposer_id            text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  receiver_id            text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  offered_accessory_id   text NOT NULL,
  requested_accessory_id text NOT NULL,
  status                 text NOT NULL DEFAULT 'pending',
  created_at             timestamptz NOT NULL DEFAULT now(),
  resolved_at            timestamptz,
  CONSTRAINT trades_not_self_check CHECK (proposer_id <> receiver_id),
  CONSTRAINT trades_status_check CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled'))
);
CREATE INDEX IF NOT EXISTS trades_receiver_status_idx ON trades (receiver_id, status);
CREATE INDEX IF NOT EXISTS trades_proposer_status_idx ON trades (proposer_id, status);

-- ---------------------------------------------------------------------------
-- Admin: configurable game rules (single row id = 'default')
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS game_settings (
  id         text PRIMARY KEY,
  data       jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);

-- ---------------------------------------------------------------------------
-- Strava
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS strava_connections (
  user_id       text PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  athlete_id    bigint NOT NULL,
  access_token  text NOT NULL,
  refresh_token text NOT NULL,
  expires_at    timestamptz NOT NULL,
  last_sync_at  timestamptz,
  athlete_name  text
);
