/**
 * Catalogue of the SQL migrations the running code depends on. The owner
 * applies them by hand in Neon, so the app checks at request time that the
 * database carries them (`checkSchema`) and shows the SQL to paste when one
 * is missing instead of crashing on the first query.
 *
 * `sql` must be byte-for-byte the statements of `db/migrations/<file>`
 * (comments stripped): `lib/db/migrations.test.ts` enforces it.
 */
export type SchemaCheck = { table: string; column?: string };

export type Migration = {
  id: string;
  file: string;
  /** What the migration adds (one check is enough when a table is created). */
  title: string;
  checks: readonly SchemaCheck[];
  sql: string;
};

export const MIGRATIONS: readonly Migration[] = [
  {
    id: "001",
    file: "001_step_entries_credited_steps.sql",
    title: "Pas déjà crédités à la créature",
    checks: [{ table: "step_entries", column: "credited_steps" }],
    sql: `ALTER TABLE step_entries ADD COLUMN IF NOT EXISTS credited_steps integer NOT NULL DEFAULT 0;`,
  },
  {
    id: "002",
    file: "002_creatures_mourned_at.sql",
    title: "Écran de deuil vu",
    checks: [{ table: "creatures", column: "mourned_at" }],
    sql: `ALTER TABLE creatures ADD COLUMN IF NOT EXISTS mourned_at timestamptz;`,
  },
  {
    id: "003",
    file: "003_game_settings.sql",
    title: "Règles de jeu modifiables depuis l'admin",
    checks: [{ table: "game_settings" }],
    sql: `CREATE TABLE IF NOT EXISTS game_settings (
  id         text PRIMARY KEY,
  data       jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);`,
  },
  {
    id: "004",
    file: "004_creatures_accessory_drops.sql",
    title: "Coffres d'accessoires ouverts",
    checks: [{ table: "creatures", column: "accessory_drops" }],
    sql: `ALTER TABLE creatures ADD COLUMN IF NOT EXISTS accessory_drops integer NOT NULL DEFAULT 0;`,
  },
  {
    id: "005",
    file: "005_gifts_trades.sql",
    title: "Cadeaux et trocs entre amis",
    checks: [{ table: "gifts" }, { table: "trades" }],
    sql: `CREATE TABLE IF NOT EXISTS gifts (
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
CREATE INDEX IF NOT EXISTS trades_proposer_status_idx ON trades (proposer_id, status);`,
  },
  {
    id: "006",
    file: "006_strava_athlete_name.sql",
    title: "Nom de l'athlète Strava",
    checks: [{ table: "strava_connections", column: "athlete_name" }],
    sql: `ALTER TABLE strava_connections ADD COLUMN IF NOT EXISTS athlete_name text;`,
  },
  {
    id: "007",
    file: "007_meals_photo_source.sql",
    title: "Origine de la photo (anti-triche)",
    checks: [{ table: "meals", column: "photo_source" }],
    sql: `ALTER TABLE meals ADD COLUMN IF NOT EXISTS photo_source text NOT NULL DEFAULT 'real';`,
  },
  {
    id: "008",
    file: "008_accessory_copies_gift_kind.sql",
    title: "Exemplaires d'accessoires et dons",
    checks: [
      { table: "user_accessories", column: "qty" },
      { table: "gifts", column: "kind" },
    ],
    sql: `ALTER TABLE user_accessories ADD COLUMN IF NOT EXISTS qty integer NOT NULL DEFAULT 1;
ALTER TABLE gifts ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'medicine';`,
  },
  {
    id: "009",
    file: "009_boardings.sql",
    title: "Pension chez un ami",
    checks: [{ table: "boardings" }],
    sql: `CREATE TABLE IF NOT EXISTS boardings (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creature_id  uuid NOT NULL REFERENCES creatures(id) ON DELETE CASCADE,
  owner_id     text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  host_id      text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  started_at   timestamptz NOT NULL DEFAULT now(),
  ends_at      timestamptz NOT NULL,
  ended_at     timestamptz,
  end_reason   text,
  host_seen_at timestamptz,
  CONSTRAINT boardings_not_self_check CHECK (owner_id <> host_id),
  CONSTRAINT boardings_end_reason_check CHECK (end_reason IS NULL OR end_reason IN ('recovered', 'returned', 'expired', 'died'))
);
CREATE INDEX IF NOT EXISTS boardings_host_idx ON boardings (host_id, ended_at);
CREATE INDEX IF NOT EXISTS boardings_owner_idx ON boardings (owner_id, ended_at);
CREATE UNIQUE INDEX IF NOT EXISTS boardings_creature_open_idx ON boardings (creature_id) WHERE ended_at IS NULL;`,
  },
  {
    id: "010",
    file: "010_coaching.sql",
    title: "Coaching",
    checks: [
      { table: "profiles", column: "student_rewards_opened" },
      { table: "profiles", column: "coach_rewards_opened" },
      { table: "coachings" },
      { table: "meal_reviews" },
    ],
    sql: `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS student_rewards_opened integer NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS coach_rewards_opened integer NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS coachings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id      text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  coach_id        text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  status          text NOT NULL DEFAULT 'pending',
  created_at      timestamptz NOT NULL DEFAULT now(),
  responded_at    timestamptz,
  ended_at        timestamptz,
  ended_by        text,
  thumbs_up       integer NOT NULL DEFAULT 0,
  thumbs_down     integer NOT NULL DEFAULT 0,
  student_seen_at timestamptz,
  CONSTRAINT coachings_not_self_check CHECK (student_id <> coach_id),
  CONSTRAINT coachings_status_check CHECK (status IN ('pending', 'active', 'declined', 'cancelled', 'ended'))
);
CREATE INDEX IF NOT EXISTS coachings_coach_status_idx ON coachings (coach_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS coachings_student_open_idx ON coachings (student_id) WHERE status IN ('pending', 'active');
CREATE TABLE IF NOT EXISTS meal_reviews (
  meal_id     uuid PRIMARY KEY REFERENCES meals(id) ON DELETE CASCADE,
  coaching_id uuid NOT NULL REFERENCES coachings(id) ON DELETE CASCADE,
  verdict     text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT meal_reviews_verdict_check CHECK (verdict IN ('up', 'down'))
);
CREATE INDEX IF NOT EXISTS meal_reviews_coaching_idx ON meal_reviews (coaching_id);`,
  },
  {
    id: "011",
    file: "011_boardings_acceptance.sql",
    title: "Pension : proposition à accepter par l'hôte",
    checks: [
      { table: "boardings", column: "status" },
      { table: "boardings", column: "owner_seen_at" },
    ],
    sql: `ALTER TABLE boardings ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';
ALTER TABLE boardings ADD COLUMN IF NOT EXISTS owner_seen_at timestamptz;
UPDATE boardings SET status = 'ended' WHERE ended_at IS NOT NULL AND status <> 'ended';
ALTER TABLE boardings DROP CONSTRAINT IF EXISTS boardings_end_reason_check;
ALTER TABLE boardings ADD CONSTRAINT boardings_end_reason_check CHECK (end_reason IS NULL OR end_reason IN ('recovered', 'returned', 'expired', 'died', 'declined', 'cancelled'));
ALTER TABLE boardings DROP CONSTRAINT IF EXISTS boardings_status_check;
ALTER TABLE boardings ADD CONSTRAINT boardings_status_check CHECK (status IN ('pending', 'active', 'ended'));`,
  },
  {
    id: "012",
    file: "012_creatures_chest_bonus_steps.sql",
    title: "Humeur : pas bonus pour les coffres",
    checks: [{ table: "creatures", column: "chest_bonus_steps" }],
    sql: `ALTER TABLE creatures ADD COLUMN IF NOT EXISTS chest_bonus_steps integer NOT NULL DEFAULT 0;`,
  },
  {
    id: "013",
    file: "013_creatures_ar_marker.sql",
    title: "Voir en vrai : un marqueur par créature",
    checks: [{ table: "creatures", column: "ar_marker" }],
    sql: `ALTER TABLE creatures ADD COLUMN IF NOT EXISTS ar_marker integer;`,
  },
  {
    id: "014",
    file: "014_play_sessions_kind.sql",
    title: "Défendre : type de partie enregistré",
    checks: [{ table: "play_sessions", column: "kind" }],
    sql: `ALTER TABLE play_sessions ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'catch';
ALTER TABLE play_sessions DROP CONSTRAINT IF EXISTS play_sessions_kind_check;
ALTER TABLE play_sessions ADD CONSTRAINT play_sessions_kind_check CHECK (kind IN ('catch', 'defense'));`,
  },
  {
    id: "015",
    file: "015_arena.sql",
    title: "Arène : bataille en réalité augmentée entre amis",
    checks: [
      { table: "arena_matches" },
      { table: "arena_players", column: "reward" },
      { table: "arena_bonuses" },
      { table: "arena_events" },
    ],
    sql: `CREATE TABLE IF NOT EXISTS arena_matches (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id          text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  status           text NOT NULL DEFAULT 'lobby',
  max_hp           integer NOT NULL DEFAULT 100,
  egg_damage       integer NOT NULL DEFAULT 15,
  duration_seconds integer NOT NULL DEFAULT 180,
  started_at       timestamptz,
  ends_at          timestamptz,
  finished_at      timestamptz,
  next_bonus_at    timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT arena_matches_status_check CHECK (status IN ('lobby', 'playing', 'finished', 'cancelled'))
);
CREATE INDEX IF NOT EXISTS arena_matches_host_status_idx ON arena_matches (host_id, status);

CREATE TABLE IF NOT EXISTS arena_players (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id      uuid NOT NULL REFERENCES arena_matches(id) ON DELETE CASCADE,
  user_id       text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  creature_id   uuid NOT NULL REFERENCES creatures(id) ON DELETE CASCADE,
  marker        integer NOT NULL,
  status        text NOT NULL DEFAULT 'invited',
  hp            integer NOT NULL DEFAULT 100,
  hits_dealt    integer NOT NULL DEFAULT 0,
  hits_taken    integer NOT NULL DEFAULT 0,
  shots         integer NOT NULL DEFAULT 0,
  good_eaten    integer NOT NULL DEFAULT 0,
  healed        integer NOT NULL DEFAULT 0,
  rank          integer,
  eliminated_at timestamptz,
  last_shot_at  timestamptz,
  rewarded_at   timestamptz,
  reward        jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT arena_players_status_check CHECK (status IN ('invited', 'ready', 'declined', 'left'))
);
CREATE UNIQUE INDEX IF NOT EXISTS arena_players_match_user_idx ON arena_players (match_id, user_id);
CREATE INDEX IF NOT EXISTS arena_players_user_idx ON arena_players (user_id);

CREATE TABLE IF NOT EXISTS arena_bonuses (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id       uuid NOT NULL REFERENCES arena_matches(id) ON DELETE CASCADE,
  anchor_user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  kind           text NOT NULL,
  x              double precision NOT NULL,
  y              double precision NOT NULL,
  heal           integer NOT NULL,
  expires_at     timestamptz NOT NULL,
  eaten_by       text REFERENCES "user"(id) ON DELETE SET NULL,
  eaten_at       timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS arena_bonuses_match_expires_idx ON arena_bonuses (match_id, expires_at);

CREATE TABLE IF NOT EXISTS arena_events (
  id         bigserial PRIMARY KEY,
  match_id   uuid NOT NULL REFERENCES arena_matches(id) ON DELETE CASCADE,
  actor_id   text REFERENCES "user"(id) ON DELETE CASCADE,
  kind       text NOT NULL,
  payload    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS arena_events_match_id_idx ON arena_events (match_id, id);

ALTER TABLE play_sessions DROP CONSTRAINT IF EXISTS play_sessions_kind_check;
ALTER TABLE play_sessions ADD CONSTRAINT play_sessions_kind_check CHECK (kind IN ('catch', 'defense', 'arena'));`,
  },
  {
    id: "016",
    file: "016_coop_defense.sql",
    title: "Défendre à deux : mode coopératif des parties entre amis",
    checks: [
      { table: "arena_matches", column: "mode" },
      { table: "arena_matches", column: "seed" },
      { table: "arena_matches", column: "state" },
      { table: "arena_matches", column: "state_at" },
    ],
    sql: `ALTER TABLE arena_matches ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'arena';
ALTER TABLE arena_matches DROP CONSTRAINT IF EXISTS arena_matches_mode_check;
ALTER TABLE arena_matches ADD CONSTRAINT arena_matches_mode_check CHECK (mode IN ('arena', 'coop'));
ALTER TABLE arena_matches ADD COLUMN IF NOT EXISTS seed integer NOT NULL DEFAULT 0;
ALTER TABLE arena_matches ADD COLUMN IF NOT EXISTS state jsonb;
ALTER TABLE arena_matches ADD COLUMN IF NOT EXISTS state_at timestamptz;

ALTER TABLE play_sessions DROP CONSTRAINT IF EXISTS play_sessions_kind_check;
ALTER TABLE play_sessions ADD CONSTRAINT play_sessions_kind_check CHECK (kind IN ('catch', 'defense', 'arena', 'coop'));`,
  },
  {
    id: "017",
    file: "017_arena_stakes.sql",
    title: "Mises de l'Arène : accessoires misés avant la bataille, remportés par le vainqueur",
    checks: [{ table: "arena_stakes" }, { table: "arena_players", column: "stakes_agreed_at" }],
    sql: `CREATE TABLE IF NOT EXISTS arena_stakes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id     uuid NOT NULL REFERENCES arena_matches(id) ON DELETE CASCADE,
  user_id      text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  accessory_id text NOT NULL,
  taken_at     timestamptz,
  settled_at   timestamptz,
  winner_id    text REFERENCES "user"(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS arena_stakes_match_user_accessory_idx ON arena_stakes (match_id, user_id, accessory_id);
CREATE INDEX IF NOT EXISTS arena_stakes_user_idx ON arena_stakes (user_id);
ALTER TABLE arena_players ADD COLUMN IF NOT EXISTS stakes_agreed_at timestamptz;`,
  },
  {
    id: "018",
    file: "018_pingpong.sql",
    title: "Ping-pong : nouveau type de partie entre amis, points par joueur",
    checks: [{ table: "arena_players", column: "points" }],
    sql: `ALTER TABLE arena_matches DROP CONSTRAINT IF EXISTS arena_matches_mode_check;
ALTER TABLE arena_matches ADD CONSTRAINT arena_matches_mode_check CHECK (mode IN ('arena', 'coop', 'pingpong'));
ALTER TABLE arena_players ADD COLUMN IF NOT EXISTS points integer NOT NULL DEFAULT 0;
ALTER TABLE play_sessions DROP CONSTRAINT IF EXISTS play_sessions_kind_check;
ALTER TABLE play_sessions ADD CONSTRAINT play_sessions_kind_check CHECK (kind IN ('catch', 'defense', 'arena', 'coop', 'pingpong'));`,
  },
  // 019 was the photo marker, removed since: its columns stay unread and unchecked.
  {
    id: "020",
    file: "020_profile_theme.sql",
    title: "Design du site choisi par le joueur",
    checks: [{ table: "profiles", column: "theme" }],
    sql: `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS theme text;`,
  },
  {
    id: "021",
    file: "021_backdrops.sql",
    title: "Fonds de scène : choix par créature et fonds trouvés dans les coffres",
    checks: [{ table: "creatures", column: "backdrop" }, { table: "user_backdrops" }],
    sql: `ALTER TABLE creatures ADD COLUMN IF NOT EXISTS backdrop text;
CREATE TABLE IF NOT EXISTS user_backdrops (
  user_id     text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  backdrop_id text NOT NULL,
  obtained_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, backdrop_id)
);`,
  },
];

/** Migrations whose checks fail against the given set of existing `table` / `table.column` keys. */
export function missingMigrations(existing: ReadonlySet<string>, migrations: readonly Migration[] = MIGRATIONS): Migration[] {
  return migrations.filter((m) => m.checks.some((c) => !existing.has(c.column ? `${c.table}.${c.column}` : c.table)));
}

/** The SQL to paste in Neon for a list of migrations, in order, with a header per migration. */
export function migrationsSql(migrations: readonly Migration[]): string {
  return migrations.map((m) => `-- Migration ${m.id} — ${m.title}\n${m.sql}`).join("\n\n");
}
