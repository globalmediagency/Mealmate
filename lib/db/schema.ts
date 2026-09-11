/**
 * Drizzle schema — MUST stay strictly in sync with `db/init.sql` and the files
 * in `db/migrations/`. Column names are snake_case in the database and
 * camelCase in TypeScript.
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const timestamptz = (name: string) => timestamp(name, { withTimezone: true });

// ---------------------------------------------------------------------------
// Better Auth core tables (user, session, account, verification)
// ---------------------------------------------------------------------------

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
  updatedAt: timestamptz("updated_at").notNull().defaultNow(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamptz("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_user_id_idx").on(table.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamptz("access_token_expires_at"),
    refreshTokenExpiresAt: timestamptz("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (table) => [index("account_user_id_idx").on(table.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamptz("expires_at").notNull(),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

// ---------------------------------------------------------------------------
// MealMate tables
// ---------------------------------------------------------------------------

export const profiles = pgTable(
  "profiles",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    username: text("username").notNull(),
    friendCode: text("friend_code").notNull().unique(),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (table) => [
    // Usernames are unique case-insensitively ("Chabond" == "chabond").
    uniqueIndex("profiles_username_lower_idx").on(sql`lower(${table.username})`),
  ],
);

export const creatures = pgTable(
  "creatures",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    tier: text("tier", { enum: ["facile", "moyen", "difficile"] }).notNull(),
    status: text("status", { enum: ["egg", "alive", "dead"] })
      .notNull()
      .default("egg"),
    speciesId: text("species_id"),
    rarity: text("rarity", {
      enum: ["commun", "rare", "tres_rare", "legendaire"],
    }),
    name: text("name"),
    eggSteps: integer("egg_steps").notNull().default(0),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    hatchedAt: timestamptz("hatched_at"),
    health: doublePrecision("health").notNull().default(100),
    hunger: doublePrecision("hunger").notNull().default(0),
    mood: doublePrecision("mood").notNull().default(100),
    xp: integer("xp").notNull().default(0),
    sickSince: timestamptz("sick_since"),
    protectedUntil: timestamptz("protected_until"),
    lastTickAt: timestamptz("last_tick_at").notNull().defaultNow(),
    diedAt: timestamptz("died_at"),
    deathCause: text("death_cause"),
    lifespanDays: integer("lifespan_days"),
    /** When the user acknowledged the death (mourning screen shown once). */
    mournedAt: timestamptz("mourned_at"),
    /** Accessory chests already opened for this creature (phase 5). */
    accessoryDrops: integer("accessory_drops").notNull().default(0),
  },
  (table) => [
    index("creatures_user_status_idx").on(table.userId, table.status),
    // A user has at most one egg or living creature at a time.
    uniqueIndex("creatures_one_active_per_user_idx")
      .on(table.userId)
      .where(sql`${table.status} in ('egg', 'alive')`),
    check(
      "creatures_tier_check",
      sql`${table.tier} in ('facile', 'moyen', 'difficile')`,
    ),
    check(
      "creatures_status_check",
      sql`${table.status} in ('egg', 'alive', 'dead')`,
    ),
  ],
);

export const meals = pgTable(
  "meals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    creatureId: uuid("creature_id")
      .notNull()
      .references(() => creatures.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    imageKey: text("image_key").notNull(),
    imageHash: text("image_hash").notNull(),
    score: integer("score").notNull(),
    verdict: text("verdict", { enum: ["sain", "correct", "peu_sain"] }).notNull(),
    foods: jsonb("foods").$type<string[]>().notNull().default([]),
    macros: jsonb("macros")
      .$type<Record<string, number>>()
      .notNull()
      .default({}),
    portion: text("portion"),
    comment: text("comment"),
    creatureLine: text("creature_line"),
    healthDelta: doublePrecision("health_delta").notNull().default(0),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    /** Origin of the picture as judged by the AI (migration 007). */
    photoSource: text("photo_source", { enum: ["real", "screen", "printed", "unknown"] })
      .notNull()
      .default("real"),
  },
  (table) => [
    index("meals_user_created_idx").on(table.userId, table.createdAt),
    index("meals_creature_created_idx").on(table.creatureId, table.createdAt),
  ],
);

export const stepEntries = pgTable(
  "step_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    steps: integer("steps").notNull(),
    source: text("source", { enum: ["manual", "strava", "pedometer"] }).notNull(),
    stravaActivityId: bigint("strava_activity_id", { mode: "number" }).unique(),
    /** Steps of the day already converted into creature effects. */
    creditedSteps: integer("credited_steps").notNull().default(0),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("step_entries_user_date_idx").on(table.userId, table.date),
    // One manual entry per user and day (editable). Strava may have several.
    uniqueIndex("step_entries_manual_unique_idx")
      .on(table.userId, table.date, table.source)
      .where(sql`${table.source} = 'manual'`),
    check(
      "step_entries_source_check",
      sql`${table.source} in ('manual', 'strava', 'pedometer')`,
    ),
  ],
);

export const playSessions = pgTable(
  "play_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    creatureId: uuid("creature_id")
      .notNull()
      .references(() => creatures.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    score: integer("score").notNull(),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("play_sessions_creature_created_idx").on(
      table.creatureId,
      table.createdAt,
    ),
  ],
);

export const userAccessories = pgTable(
  "user_accessories",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessoryId: text("accessory_id").notNull(),
    obtainedAt: timestamptz("obtained_at").notNull().defaultNow(),
    /** Copies owned (migration 008): trades and gifts move copies, chests add one. */
    qty: integer("qty").notNull().default(1),
  },
  (table) => [primaryKey({ columns: [table.userId, table.accessoryId] })],
);

export const creatureOutfits = pgTable(
  "creature_outfits",
  {
    creatureId: uuid("creature_id")
      .notNull()
      .references(() => creatures.id, { onDelete: "cascade" }),
    slot: text("slot", { enum: ["head", "eyes", "neck", "body"] }).notNull(),
    accessoryId: text("accessory_id").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.creatureId, table.slot] }),
    check(
      "creature_outfits_slot_check",
      sql`${table.slot} in ('head', 'eyes', 'neck', 'body')`,
    ),
  ],
);

export const friendships = pgTable(
  "friendships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requesterId: text("requester_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    addresseeId: text("addressee_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    status: text("status", { enum: ["pending", "accepted"] })
      .notNull()
      .default("pending"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("friendships_pair_idx").on(table.requesterId, table.addresseeId),
    index("friendships_addressee_idx").on(table.addresseeId),
    check(
      "friendships_not_self_check",
      sql`${table.requesterId} <> ${table.addresseeId}`,
    ),
    check(
      "friendships_status_check",
      sql`${table.status} in ('pending', 'accepted')`,
    ),
  ],
);

export const purchases = pgTable(
  "purchases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    stripeSessionId: text("stripe_session_id").notNull().unique(),
    item: text("item").notNull(),
    amountCents: integer("amount_cents").notNull(),
    status: text("status").notNull().default("pending"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (table) => [index("purchases_user_idx").on(table.userId)],
);

export const inventory = pgTable(
  "inventory",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    item: text("item").notNull(),
    qty: integer("qty").notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.userId, table.item] })],
);

/** Medicine sent to a friend's creature (phase 7). */
export const gifts = pgTable(
  "gifts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fromUserId: text("from_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    toUserId: text("to_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    creatureId: uuid("creature_id").references(() => creatures.id, { onDelete: "set null" }),
    item: text("item").notNull(),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    /** When the recipient saw the notice on their home screen. */
    seenAt: timestamptz("seen_at"),
    /** "medicine" (item = shop item) or "accessory" (item = accessory id), migration 008. */
    kind: text("kind", { enum: ["medicine", "accessory"] }).notNull().default("medicine"),
  },
  (table) => [
    index("gifts_to_user_created_idx").on(table.toUserId, table.createdAt),
    check("gifts_not_self_check", sql`${table.fromUserId} <> ${table.toUserId}`),
  ],
);

/**
 * A creature entrusted to a friend for a while (spec § 3.16). While the row is
 * open (`ended_at IS NULL`) the host holds the creature: their meals, steps,
 * games and medicine apply to it and its chests are theirs.
 */
export const boardings = pgTable(
  "boardings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    creatureId: uuid("creature_id")
      .notNull()
      .references(() => creatures.id, { onDelete: "cascade" }),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    hostId: text("host_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    startedAt: timestamptz("started_at").notNull().defaultNow(),
    /** Agreed end of the stay (≤ 30 days after the start); the creature comes home lazily after that. */
    endsAt: timestamptz("ends_at").notNull(),
    endedAt: timestamptz("ended_at"),
    endReason: text("end_reason", { enum: ["recovered", "returned", "expired", "died"] }),
    /** When the host saw the "new creature in your care" notice. */
    hostSeenAt: timestamptz("host_seen_at"),
  },
  (table) => [
    index("boardings_host_idx").on(table.hostId, table.endedAt),
    index("boardings_owner_idx").on(table.ownerId, table.endedAt),
    // One open boarding per creature.
    uniqueIndex("boardings_creature_open_idx").on(table.creatureId).where(sql`${table.endedAt} IS NULL`),
    check("boardings_not_self_check", sql`${table.ownerId} <> ${table.hostId}`),
    check("boardings_end_reason_check", sql`${table.endReason} IS NULL OR ${table.endReason} IN ('recovered', 'returned', 'expired', 'died')`),
  ],
);

/** Accessory swap proposed between two friends (phase 7). */
export const trades = pgTable(
  "trades",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    proposerId: text("proposer_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    receiverId: text("receiver_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    offeredAccessoryId: text("offered_accessory_id").notNull(),
    requestedAccessoryId: text("requested_accessory_id").notNull(),
    status: text("status", { enum: ["pending", "accepted", "declined", "cancelled"] })
      .notNull()
      .default("pending"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    resolvedAt: timestamptz("resolved_at"),
  },
  (table) => [
    index("trades_receiver_status_idx").on(table.receiverId, table.status),
    index("trades_proposer_status_idx").on(table.proposerId, table.status),
    check("trades_not_self_check", sql`${table.proposerId} <> ${table.receiverId}`),
    check(
      "trades_status_check",
      sql`${table.status} in ('pending', 'accepted', 'declined', 'cancelled')`,
    ),
  ],
);

/** Admin-editable overrides of the game constants (single row, id = "default"). */
export const gameSettings = pgTable("game_settings", {
  id: text("id").primaryKey(),
  data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
  updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  updatedBy: text("updated_by"),
});

export const stravaConnections = pgTable("strava_connections", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  athleteId: bigint("athlete_id", { mode: "number" }).notNull(),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  expiresAt: timestamptz("expires_at").notNull(),
  lastSyncAt: timestamptz("last_sync_at"),
  /** First name of the athlete, for display only (migration 006). */
  athleteName: text("athlete_name"),
});

// ---------------------------------------------------------------------------
// Inferred row types
// ---------------------------------------------------------------------------

export type User = typeof user.$inferSelect;
export type Profile = typeof profiles.$inferSelect;
export type Creature = typeof creatures.$inferSelect;
export type Meal = typeof meals.$inferSelect;
export type StepEntry = typeof stepEntries.$inferSelect;
export type PlaySession = typeof playSessions.$inferSelect;
export type Friendship = typeof friendships.$inferSelect;
export type Purchase = typeof purchases.$inferSelect;
export type InventoryRow = typeof inventory.$inferSelect;
export type Gift = typeof gifts.$inferSelect;
export type Trade = typeof trades.$inferSelect;
export type Boarding = typeof boardings.$inferSelect;
export type StravaConnection = typeof stravaConnections.$inferSelect;
