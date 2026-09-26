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
  /** Longest stay at a friend's, in days (spec § 3.16). */
  boardingMaxDays: number;
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
    boardingMaxDays: 30,
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
    boardingMaxDays: 30,
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
    boardingMaxDays: 30,
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

/**
 * Themed collections added on top of a tier's roster, with their own quotas:
 * the Zodiaque (the twelve animals of the Chinese zodiac, in pixel art,
 * hatched from "moyen" eggs like the rest of that tier).
 */
export const COLLECTIONS = {
  zodiaque: { label: "Zodiaque", tier: "moyen", perRarity: { commun: 6, rare: 3, tres_rare: 2, legendaire: 1 } },
} as const satisfies Record<string, { label: string; tier: Tier; perRarity: Record<Rarity, number> }>;
export type CollectionId = keyof typeof COLLECTIONS;

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

/** Backdrops found in step chests (spec § 3.28): the chance a chest holds one instead of an accessory while some are still missing. */
export const BACKDROP_DROPS = {
  chestChance: 0.25,
} as const;

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
  /** Refuse photos of a screen or a printed picture (admin-tunable; off = warn only). */
  rejectScreenPhotos: false,
  maxMealsPerDay: 5,
  /** Meals (rows and photos) are deleted after this many days (admin-tunable). */
  mealRetentionDays: 30,
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
  /** One Gemini image tile (768 px) is enough to recognise a plate, and the upload is lighter. */
  resizeMaxPx: 768,
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
/** Coaching (spec § 3.17): a friend reviews the student's meals with thumbs. Admin-tunable defaults. */
export const COACHING = {
  /** Net thumbs (up − down) the student needs per surprise accessory. */
  thumbsPerStudentReward: 5,
  /** Thumbs (up or down) the coach gives per surprise accessory. */
  thumbsPerCoachReward: 10,
} as const;

/** Boarding a creature at a friend's (spec § 3.16). The per-tier maximum stay lives in TIER_CONFIG. */
export const BOARDING = {
  /** Hard ceiling accepted by the API whatever the admin rules say (days). */
  absoluteMaxDays: 365,
  /** Durations offered in the dialog (days), trimmed to the tier's maximum. */
  durations: [3, 7, 14, 21, 30],
  /** How many creatures one player can host at the same time (admin-tunable default). */
  maxPerHost: 5,
  /** After a stay of X days, the owner waits X × this before lending again (admin-tunable default; 0 = no wait). */
  cooldownMultiplier: 1,
} as const;

/** Mood effects (spec § 3.18). Admin-tunable defaults; thresholds compare the mood gauge (0–100). */
export const MOOD = {
  /** Mood at or above this: XP bonus and extra chest steps. */
  happyMin: 70,
  /** XP bonus (%) on meals, games and steps when happy. */
  xpBonusPercent: 25,
  /** Mood strictly below this: XP malus. */
  lowMax: 30,
  /** XP malus (%) when low. */
  xpMalusPercent: 25,
  /** Mood strictly below this: health drops even when fed. */
  gloomyMax: 20,
  /** Health lost per hour while gloomy. */
  healthLossPerHourWhenGloomy: 0.5,
  /** Extra chest steps (%) counted on steps credited while happy. */
  chestStepsBonusPercent: 10,
} as const;

export const PLAY = {
  maxPerDay: 3,
  durationSeconds: 20,
  moodGain: 15,
  xpGain: 5,
  xpBonusPerfect: 5,
} as const;

/**
 * Tossing the creature on its home screen (spec § 3.5): grab it, throw it, it
 * bounces off the walls of its scene shedding its accessories, then runs to
 * pick each one up. Lengths in pixels of the scene, times in seconds,
 * fractions relative to the creature drawing's size.
 */
/** The home screen scene (spec § 3.26): the admin-tunable defaults of `rules.home`. */
export const HOME = {
  /** Side of the creature drawing (px). */
  creatureSize: 220,
} as const;

export const TOSS = {
  /** Downward acceleration (px/s²) and speed cap (px/s). */
  gravity: 2600,
  maxSpeed: 2800,
  /** Speed kept after a wall or ceiling bounce, and after a floor bounce (admin-tunable defaults, `rules.home`); horizontal speed kept when hitting the floor. */
  restitution: 0.85,
  floorRestitution: 0.65,
  floorFriction: 0.8,
  /** Rolling slowdown on the floor (fraction of speed lost per second). */
  rollFriction: 3.5,
  /** A release slower than this is a drop, not a throw (no spin, no "throw" line). */
  throwMinSpeed: 260,
  /** An impact faster than this sheds one accessory (head first): a fall from a hand's height stays gentle. */
  dropImpactSpeed: 700,
  /** Below this (px/s) on the floor the creature stops rolling; a floor bounce slower than `bounceStop` ends the flight. */
  restSpeed: 40,
  bounceStop: 140,
  /** Spin (°/s) per px/s of horizontal speed at release, capped (a swing built up under the finger is kept too). */
  spinPerSpeed: 0.35,
  maxSpin: 720,
  /**
   * Held by the finger, the creature hangs from the point it was grabbed at
   * (a pin joint) and swings like a pendulum: `gyration` = its radius of
   * gyration as a fraction of the drawing (how easily it turns), `pivotFollow`
   * = how fast the pin catches up with the finger (1/s, smooths the pointer
   * events), `swingDamping` = loss of swing per second, `pinIterations` =
   * constraint passes per sub-step.
   */
  gyration: 0.22,
  pivotFollow: 45,
  swingDamping: 1.1,
  pinIterations: 3,
  /** Getting back on its feet, running speed (px/s), pick-up reach (px) and pause. */
  landingSeconds: 0.55,
  runSpeed: 300,
  pickupDistance: 26,
  pickupSeconds: 0.35,
  /** How far the creature turns toward where it runs (degrees of yaw). */
  runYaw: 40,
  /** Fallen accessories: their own, lighter physics; they settle on the floor a little below the creature's centre. */
  item: { gravity: 2200, restitution: 0.4, friction: 0.7, restSpeed: 30, maxSeconds: 4, half: 0.16, floor: 0.34 },
  /** The floor shadow: its line below the drawing's centre (fraction of the size, = the SVG's ground line), its opacity at rest and its smallest scale in flight. */
  shadowLine: 0.435,
  shadowOpacity: 0.28,
  shadowMinScale: 0.35,
  /** Stand-in silhouette when no drawing is known (`defaultShape`): half width, reach above and below the centre, as fractions of the size; and the gap kept under its feet. */
  box: { side: 0.28, top: 0.3, bottom: 0.42 },
  restBottom: 4,
  /** A press shorter than this and moving less than this is a pat, not a throw; pointer samples used for the release speed. */
  tapMs: 350,
  tapDistance: 8,
  velocityWindowMs: 90,
} as const;

/** The 3D creature on its printed marker (spec § 3.19), shared by « Voir en vrai » and every AR game: the admin-tunable default of `rules.ar`. */
export const AR_SCENE = {
  /** Height of the creature in marker sides (the printed square is 1). */
  creatureHeight: 2.2,
} as const;

/**
 * "Défendre": the tower-defense game played on the printed marker (spec § 3.21).
 * Lengths are in marker sides, times in seconds. The first six values are the
 * admin-tunable defaults (`rules.defense`); the rest is fixed.
 */
export const DEFENSE = {
  hp: 100,
  /** Speed (sides per second) of a plain food on wave 1. */
  baseSpeed: 0.32,
  /** Speed increase per wave, in percent of the base speed. */
  speedGrowthPercent: 12,
  firstWaveEnemies: 5,
  enemiesGrowthPerWave: 2,
  fireCooldownMs: 350,
  /** A boss (a huge food needing several eggs) closes every wave whose number is a multiple of this; 0 = never. */
  bossEveryWaves: 3,
  /** Eggs needed to destroy the first boss (one more at each following boss). */
  bossHits: 3,
  /** How far foods appear from the creature at most (admin-tunable default, `rules.defense.spawnDistance`); they surge between `spawnNearFraction` × that and that. */
  arenaRadius: 2.8,
  spawnNearFraction: 0.75,
  /** How far the aim point can go: at least this, and always a bit beyond where foods appear (`aimBeyondSpawn`). */
  aimMaxRadius: 3.4,
  aimBeyondSpawn: 0.6,
  /** A food closer than this has reached the creature. */
  reachRadius: 0.45,
  /** An egg destroys the foods within this distance of its landing point (and lower than `blastHeight`). */
  blastRadius: 0.5,
  blastHeight: 0.35,
  eggFlightSeconds: 0.42,
  /** Extra flight time per side of distance. */
  eggFlightPerSide: 0.06,
  eggArcHeight: 0.55,
  smokeSeconds: 0.7,
  waveIntroSeconds: 2.2,
  firstSpawnInterval: 1.8,
  spawnIntervalStepPerWave: 0.15,
  minSpawnInterval: 0.55,
  /** Waves to clear for a perfect game (with every food destroyed). */
  perfectWaves: 3,
  pointsPerFood: 10,
  /** Collision radius of a plain food and of a boss (added to the blast and reach radii). */
  foodRadius: 0.1,
  bossRadius: 0.4,
  bossScale: 2.2,
  bossSpeedFactor: 0.5,
  bossDamageFactor: 2,
  /** Good foods (fruits and vegetables) pop on the table during waves and vanish after staying then blinking. */
  goodSpawnMinSeconds: 6,
  goodSpawnMaxSeconds: 10,
  goodStaySeconds: 4,
  goodBlinkSeconds: 1.5,
  maxGoodFoods: 2,
  goodRadius: 0.15,
  /** The tongue: reach, corridor half-width, height it sweeps under, motion time, share of it spent extending, reload. */
  tongueMaxLength: 2.3,
  tongueRadius: 0.3,
  tongueHeight: 0.5,
  tongueSeconds: 0.6,
  tongueExtendFraction: 0.4,
  tongueCooldownMs: 900,
  /** Where the tongue leaves from before the creature's own mouth is known (`CreatureMesh.mouth`); it always goes out at least `tongueMinLength`. */
  tongueBaseOffset: 0.4,
  tongueBaseHeight: 0.8,
  tongueMinLength: 1.2,
} as const;

/**
 * "Arène": the augmented-reality battle between friends (spec § 3.22). The
 * first four values are the admin-tunable defaults (`rules.arena`).
 */
export const ARENA = {
  hp: 100,
  eggDamage: 15,
  durationSeconds: 180,
  /** Sync the phones through WebRTC instead of short polling (not available yet: polling stays). */
  webrtc: false,
  maxPlayers: 4,
  /** A landing egg hits a creature within this distance of its centre (marker sides). */
  hitRadius: 0.55,
  /** Aim farther than this from every creature: the egg still flies toward the nearest one, and misses. */
  aimMaxRadius: 2.2,
  shotCooldownMs: 350,
  /** Server-side tolerance on the shot cadence. */
  shotMinIntervalMs: 250,
  /** Good foods pop on the table around a random creature at this pace and stay this long. */
  bonusEverySeconds: 9,
  firstBonusSeconds: 5,
  bonusStaySeconds: 4.5,
  bonusBlinkSeconds: 1.5,
  maxBonuses: 3,
  bonusMinDistance: 0.8,
  bonusMaxDistance: 1.6,
  /** A lobby nobody started is cancelled after this. */
  lobbyTtlMinutes: 30,
  /** How often the phones ask the server for news, in polling mode. */
  pollMs: 500,
  lobbyPollMs: 2000,
  /** Invitations reach every page of the app: the phone asks for news at this pace (slower when the tab is hidden). */
  notices: { pollMs: 5000, hiddenPollMs: 30_000 },
  /** Direct link between the phones (WebRTC data channels), when the admin enables it: the referee is still polled, more slowly. */
  rtc: {
    /** Referee poll while the direct link carries the eggs and tongues. */
    pollMs: 1000,
    /** Public STUN servers (no TURN: phones that cannot reach each other keep the polling). */
    iceServers: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"],
    /** Wait for the ICE candidates this long before sending an offer or an answer (no trickle). */
    gatherTimeoutMs: 2500,
    /** Signal polling: fast while a peer is missing, slow once everybody is linked. */
    signalPollMs: 1000,
    signalIdlePollMs: 5000,
    /** A peer still not linked after this is left to the polling. */
    connectTimeoutMs: 20_000,
  },
} as const;

/** "Défendre à deux" (spec § 3.23): the cooperative defense on several papers. */
export const COOP = {
  /** The host publishes its simulation this often over the direct link, and to the server. */
  broadcastMs: 500,
  storeMs: 1000,
  /** A guest catching up on a published state steps it forward in these increments, up to this long. */
  catchUpStepSeconds: 1 / 60,
  maxCatchUpSeconds: 2,
  /** Without news from the host for this long, a guest may end the battle itself. */
  hostSilenceMs: 20_000,
  /** Safety net: a battle nobody ended is closed after this. */
  maxSeconds: 1200,
  /** The crosshair picks the creature whose paper it points at within this distance of the creature (marker sides). */
  aimMaxRadius: 3.4,
} as const;

/** "Ping-pong" (spec § 3.25): a rally between two creatures on their papers, hit on time. */
export const PINGPONG = {
  players: 2,
  pointsToWin: 7,
  /** Safety net: a match nobody ended is closed after this. */
  maxSeconds: 300,
  /** Flight of the ball between the two creatures: at the start of a rally, then faster with every hit, down to a floor. */
  firstFlightMs: 2200,
  minFlightMs: 550,
  paceFactor: 0.9,
  /** Timing windows around the ball's arrival, as a share of the flight time (they tighten as the rally speeds up), never under the floors. */
  goodWindowPercent: 15,
  perfectWindowPercent: 6,
  minGoodMs: 120,
  minPerfectMs: 50,
  /** Shots: a lob flies slower and hides the timing ring on its way down; a perfect hit is a smash, faster (never under `smashMinMs`). */
  lobFactor: 1.5,
  lobHiddenTail: 0.4,
  smashFactor: 0.7,
  smashMinMs: 400,
  /** Past this many hits in a rally the timing ring disappears (0 = never). */
  ringHideAfterHits: 6,
  /** The referee waits this long past the window for the receiver's report before calling a miss. */
  graceMs: 1500,
  /** The point is shown this long before the next serve. */
  pointPauseMs: 1800,
  /** The server has this long to serve before the ball is served for them. */
  serveTimeoutMs: 10_000,
  /** Height of the arc and of the ball at the creatures (marker sides). */
  arcHeight: 0.6,
  ballHeight: 0.55,
  ballRadius: 0.11,
  /** The host publishes its state this often over the direct link, and to the server. */
  broadcastMs: 400,
  storeMs: 1000,
  /** Without news from the host for this long, a guest may end the match itself. */
  hostSilenceMs: 20_000,
  /** A guest keeps its own prediction ahead of the host's state at most this long. */
  maxPredictionMs: 3000,
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

/** Hunger (0 = full, 100 = starving) from which the creature says it is hungry and « Nourrir » is highlighted. */
export const HUNGER_ALERT_THRESHOLD = 60;

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
