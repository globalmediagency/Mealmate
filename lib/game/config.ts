/**
 * Game rules — every tunable constant of MealMate lives here (spec § 3).
 * Values are plain data so they can be unit-tested and adjusted freely.
 */

export const TIERS = ["facile", "moyen", "difficile"] as const;
export type Tier = (typeof TIERS)[number];

export const RARITIES = ["commun", "rare", "tres_rare", "legendaire"] as const;
export type Rarity = (typeof RARITIES)[number];

export type TierConfig = {
  id: Tier;
  label: string;
  /** Cumulated steps needed for the egg to hatch. */
  hatchSteps: number;
  /** Gemini score (/100) at or above which a meal counts as "healthy". */
  healthyScoreThreshold: number;
  /** Hunger gained per hour (0 = full, 100 = starving). */
  hungerPerHour: number;
  /** Health lost per hour while hunger > HUNGER_DAMAGE_THRESHOLD. */
  healthLossPerHourWhenStarving: number;
  /** Mood lost per hour. */
  moodLossPerHour: number;
  /** Consecutive days in the "sick" state before death. */
  sickDaysBeforeDeath: number;
  /** Universe of species, shown on the egg choice screen. */
  universe: string;
  /** Short pitch shown on the egg card. */
  description: string;
};

export const TIER_CONFIG: Record<Tier, TierConfig> = {
  facile: {
    id: "facile",
    label: "Facile",
    hatchSteps: 15_000,
    healthyScoreThreshold: 40,
    hungerPerHour: 2,
    healthLossPerHourWhenStarving: 0.5,
    moodLossPerHour: 0.5,
    sickDaysBeforeDeath: 7,
    universe: "Compagnons domestiques et rondouillards",
    description:
      "Chats, lapins, hamsters, canards… Des compagnons indulgents qui pardonnent les écarts.",
  },
  moyen: {
    id: "moyen",
    label: "Moyen",
    hatchSteps: 30_000,
    healthyScoreThreshold: 55,
    hungerPerHour: 3,
    healthLossPerHourWhenStarving: 1,
    moodLossPerHour: 1,
    sickDaysBeforeDeath: 5,
    universe: "Créatures de la forêt",
    description:
      "Renard, loup, cerf, hibou, blaireau… Des créatures qui attendent une vraie régularité.",
  },
  difficile: {
    id: "difficile",
    label: "Difficile",
    hatchSteps: 50_000,
    healthyScoreThreshold: 70,
    hungerPerHour: 4,
    healthLossPerHourWhenStarving: 1.5,
    moodLossPerHour: 1.5,
    sickDaysBeforeDeath: 3,
    universe: "Créatures mythiques",
    description:
      "Dragon, phénix, kitsune, golem, licorne… Des êtres exigeants qui tombent vite malades si on les néglige.",
  },
};

/** Hunger level above which health starts dropping. */
export const HUNGER_DAMAGE_THRESHOLD = 80;

/** Hatch probabilities per rarity (must sum to 1). */
export const RARITY_WEIGHTS: Record<Rarity, number> = {
  commun: 0.6,
  rare: 0.28,
  tres_rare: 0.1,
  legendaire: 0.02,
};

/** Number of species per rarity inside each tier (20 species per tier). */
export const SPECIES_PER_RARITY: Record<Rarity, number> = {
  commun: 9,
  rare: 6,
  tres_rare: 4,
  legendaire: 1,
};

export const SPECIES_PER_TIER = 20;

export const RARITY_LABELS: Record<Rarity, string> = {
  commun: "Commun",
  rare: "Rare",
  tres_rare: "Très rare",
  legendaire: "Légendaire",
};

/** Accessory drop probabilities per rarity (must sum to 1). */
export const ACCESSORY_RARITY_WEIGHTS: Record<Rarity, number> = {
  commun: 0.65,
  rare: 0.25,
  tres_rare: 0.08,
  legendaire: 0.02,
};

/** Visual state thresholds derived from health. */
export const HEALTH_STATE = {
  healthyMin: 60,
  tiredMin: 30,
} as const;

/** Lazy tick behaviour (spec § 3.4). */
export const TICK = {
  /** Beyond this many elapsed hours, degradation continues at `slowRate`. */
  fullRateHoursCap: 72,
  slowRate: 0.25,
} as const;

/** Feeding rules (spec § 3.5). */
export const FEEDING = {
  maxMealsPerDay: 5,
  duplicateWindowHours: 24,
  healthDeltaDivisor: 4,
  healthDeltaMin: -15,
  healthDeltaMax: 12,
  hungerReduction: 40,
  moodGain: 5,
  xpGain: 10,
  xpBonusHealthy: 5,
  /** Below this hunger the creature is "full": health effect halved. */
  fullHungerThreshold: 15,
  maxImageBytesBeforeResize: 4 * 1024 * 1024,
  maxImageBytesAfterResize: 1.5 * 1024 * 1024,
  resizeMaxPx: 1024,
  resizeJpegQuality: 0.8,
} as const;

/** Walking rules (spec § 3.6). */
export const STEPS = {
  maxManualPerDay: 40_000,
  healthPerThousandSteps: 1,
  maxHealthPerDay: 10,
  xpPerThousandSteps: 2,
  stepsPerAccessory: 5_000,
  duplicateAccessoryXp: 20,
  strava: {
    syncWindowDays: 30,
    minSyncIntervalMinutes: 5,
    /** Step-equivalent per metre for running / walking / hiking. */
    footPerMetre: 1.3,
    /** Step-equivalent per metre for cycling. */
    bikePerMetre: 0.4,
    /** Step-equivalent per minute for any other sport. */
    otherPerMinute: 100,
  },
} as const;

/** Mini-game rules (spec § 3.7). */
export const PLAY = {
  maxPerDay: 3,
  durationSeconds: 20,
  moodGain: 15,
  xpGain: 5,
  xpBonusPerfect: 5,
} as const;

/** Growth stages by XP (spec § 3.8). */
export const STAGES = [
  { id: "bebe", label: "Bébé", minXp: 0 },
  { id: "enfant", label: "Enfant", minXp: 150 },
  { id: "adulte", label: "Adulte", minXp: 500 },
  { id: "sage", label: "Sage", minXp: 1_200 },
] as const;
export type StageId = (typeof STAGES)[number]["id"];

/** Shop items (spec § 3.9). Prices are in euro cents, defined inline for Stripe. */
export const SHOP_ITEMS = {
  sirop: {
    id: "sirop",
    label: "Sirop",
    priceCents: 199,
    description: "Redonne 30 points de santé.",
  },
  antibiotique: {
    id: "antibiotique",
    label: "Antibiotique",
    priceCents: 399,
    description: "Santé à 100 et fin de la maladie.",
  },
  talisman: {
    id: "talisman",
    label: "Talisman",
    priceCents: 599,
    description: "Protège de la mort pendant 7 jours.",
  },
} as const;
export type ShopItemId = keyof typeof SHOP_ITEMS;

export const TALISMAN_PROTECTION_DAYS = 7;

/** Timezone used for all "per day" computations. */
export const GAME_TIMEZONE = "Europe/Paris";

/** Creature name constraints. */
export const CREATURE_NAME = { min: 2, max: 20 } as const;

/** Username / friend code constraints. */
export const USERNAME = { min: 3, max: 20 } as const;
export const FRIEND_CODE = {
  prefix: "MM-",
  length: 6,
  alphabet: "ABCDEFGHJKLMNPQRSTUVWXYZ23456789",
} as const;
