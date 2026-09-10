import { STEPS } from "./config";
import { gameDate } from "./time";

/** Strava `sport_type` values converted with the "on foot" rate. */
export const FOOT_SPORTS = new Set(["Run", "Walk", "Hike", "TrailRun", "VirtualRun", "Snowshoe", "Wheelchair"]);
/** Strava `sport_type` values converted with the cycling rate. */
export const BIKE_SPORTS = new Set(["Ride", "VirtualRide", "EBikeRide", "EMountainBikeRide", "MountainBikeRide", "GravelRide", "Handcycle", "Velomobile"]);

const SPORT_LABELS: Record<string, string> = {
  Run: "Course",
  TrailRun: "Trail",
  VirtualRun: "Course (tapis)",
  Walk: "Marche",
  Hike: "Randonnée",
  Snowshoe: "Raquettes",
  Wheelchair: "Fauteuil",
  Ride: "Vélo",
  VirtualRide: "Vélo (home trainer)",
  EBikeRide: "Vélo électrique",
  EMountainBikeRide: "VTT électrique",
  MountainBikeRide: "VTT",
  GravelRide: "Gravel",
  Handcycle: "Handbike",
  Velomobile: "Vélomobile",
  Swim: "Natation",
  Rowing: "Aviron",
  Kayaking: "Kayak",
  Yoga: "Yoga",
  WeightTraining: "Musculation",
  Workout: "Entraînement",
  Elliptical: "Elliptique",
  StairStepper: "Stepper",
  Soccer: "Football",
  Tennis: "Tennis",
  Golf: "Golf",
  RockClimbing: "Escalade",
  AlpineSki: "Ski alpin",
  BackcountrySki: "Ski de rando",
  NordicSki: "Ski de fond",
  Snowboard: "Snowboard",
  IceSkate: "Patinage",
  InlineSkate: "Roller",
  Skateboard: "Skate",
  Crossfit: "Crossfit",
  Pilates: "Pilates",
  Pickleball: "Pickleball",
  Badminton: "Badminton",
  Sail: "Voile",
  Surfing: "Surf",
  StandUpPaddling: "Paddle",
  Windsurf: "Windsurf",
  Kitesurf: "Kitesurf",
};

export type ActivityInput = {
  sportType: string;
  distanceMetres: number;
  movingTimeSeconds: number;
};

/**
 * Step-equivalent of an activity (spec § 3.14): distance × 1.3 on foot,
 * distance × 0.4 on a bike, otherwise 100 per minute of movement. Capped at
 * the manual daily maximum so one epic ride cannot dwarf everything else.
 */
export function activityStepEquivalent(activity: ActivityInput): number {
  const distance = Math.max(0, Number(activity.distanceMetres) || 0);
  const minutes = Math.max(0, Number(activity.movingTimeSeconds) || 0) / 60;
  let steps: number;
  if (FOOT_SPORTS.has(activity.sportType)) steps = distance * STEPS.strava.footPerMetre;
  else if (BIKE_SPORTS.has(activity.sportType)) steps = distance * STEPS.strava.bikePerMetre;
  else steps = minutes * STEPS.strava.otherPerMinute;
  return Math.min(STEPS.maxManualPerDay, Math.round(steps));
}

/** Game day of an activity from Strava's `start_date_local` (already in the athlete's timezone). */
export function activityDate(startDateLocal: string): string {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(startDateLocal);
  if (match) return match[1];
  const parsed = new Date(startDateLocal);
  return Number.isNaN(parsed.getTime()) ? gameDate() : gameDate(parsed);
}

export function sportLabel(sportType: string): string {
  return SPORT_LABELS[sportType] ?? sportType.replace(/([a-z])([A-Z])/g, "$1 $2");
}

const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;

/**
 * Start of the fetch window: the last 30 days on a first sync, otherwise two
 * days before the previous sync (late uploads) but never beyond the window.
 */
export function syncWindowStart(now: Date, lastSyncAt: Date | null): Date {
  const windowStart = new Date(now.getTime() - STEPS.strava.syncWindowDays * DAY_MS);
  if (!lastSyncAt) return windowStart;
  const overlap = new Date(lastSyncAt.getTime() - 2 * DAY_MS);
  return overlap > windowStart ? overlap : windowStart;
}

export type SyncGate = { allowed: boolean; retryAt: Date | null; retryInMinutes: number };

/** Manual sync throttle: at most one call every `minSyncIntervalMinutes`. */
export function syncGate(lastSyncAt: Date | null, now: Date = new Date()): SyncGate {
  if (!lastSyncAt) return { allowed: true, retryAt: null, retryInMinutes: 0 };
  const retryAt = new Date(lastSyncAt.getTime() + STEPS.strava.minSyncIntervalMinutes * MINUTE_MS);
  if (retryAt <= now) return { allowed: true, retryAt: null, retryInMinutes: 0 };
  return { allowed: false, retryAt, retryInMinutes: Math.max(1, Math.ceil((retryAt.getTime() - now.getTime()) / MINUTE_MS)) };
}
