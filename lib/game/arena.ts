/**
 * "Arène" (spec § 3.22): pure helpers shared by the server (ranking, rewards,
 * bonus placement) and the phones (aim resolution). Distances are in marker
 * sides, in the frame of the marker the creature stands on.
 */
import { ARENA } from "./config";
import { GOOD_FOODS, GOOD_KINDS, type GoodKind } from "./defense";

const TAU = Math.PI * 2;

export type ArenaStanding = {
  userId: string;
  /** Still in the game (not eliminated, did not leave). */
  alive: boolean;
  hp: number;
  hitsDealt: number;
  /** When the player went out (eliminated or left), in ms; null while alive. */
  outAt: number | null;
};

/**
 * Ranks the participants of a finished match: survivors first (most health,
 * then most hits dealt), then the others in the order they went out, the
 * last one out first. Exact ties share a rank (1, 1, 3).
 */
export function rankArenaPlayers(players: ArenaStanding[]): Map<string, number> {
  const sorted = [...players].sort((a, b) => {
    if (a.alive !== b.alive) return a.alive ? -1 : 1;
    if (a.alive) return b.hp - a.hp || b.hitsDealt - a.hitsDealt;
    return (b.outAt ?? 0) - (a.outAt ?? 0) || b.hp - a.hp || b.hitsDealt - a.hitsDealt;
  });
  const ranks = new Map<string, number>();
  let rank = 0;
  sorted.forEach((p, index) => {
    const previous = sorted[index - 1];
    const tie =
      previous !== undefined &&
      previous.alive === p.alive &&
      previous.hp === p.hp &&
      previous.hitsDealt === p.hitsDealt &&
      (p.alive || previous.outAt === p.outAt);
    if (!tie) rank = index + 1;
    ranks.set(p.userId, rank);
  });
  return ranks;
}

/**
 * Reward of a player, 0–100: half for the health kept, half for the rank
 * among `count` participants. A perfect game is first place with full health.
 */
export function arenaScore(hp: number, maxHp: number, rank: number, count: number): { score: number; perfect: boolean } {
  const healthPart = maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 0;
  const rankPart = count > 1 ? Math.max(0, Math.min(1, (count - rank) / (count - 1))) : 1;
  const score = Math.round(50 * healthPart + 50 * rankPart);
  return { score, perfect: rank === 1 && hp >= maxHp };
}

export type ArenaBonusPlacement = { anchorUserId: string; kind: GoodKind; x: number; y: number; heal: number };

/** A good food dropped next to a random one of the `anchorIds` creatures (null when nobody is left). */
export function placeArenaBonus(random: () => number, anchorIds: string[]): ArenaBonusPlacement | null {
  if (anchorIds.length === 0) return null;
  const anchorUserId = anchorIds[Math.min(anchorIds.length - 1, Math.floor(random() * anchorIds.length))];
  const kind = GOOD_KINDS[Math.min(GOOD_KINDS.length - 1, Math.floor(random() * GOOD_KINDS.length))];
  const angle = random() * TAU;
  const dist = ARENA.bonusMinDistance + random() * (ARENA.bonusMaxDistance - ARENA.bonusMinDistance);
  return { anchorUserId, kind, x: Math.cos(angle) * dist, y: Math.sin(angle) * dist, heal: GOOD_FOODS[kind].heal };
}

export type AimCandidate = {
  userId: string;
  /** Where the crosshair meets this creature's marker plane, in that marker's frame. */
  x: number;
  y: number;
};

export type AimResolution = AimCandidate & { distance: number; hit: boolean };

/**
 * The adversary the crosshair points at: the one whose creature is nearest to
 * the aimed point, within `ARENA.aimMaxRadius`. `hit` tells whether an egg
 * landing there touches the creature.
 */
export function arenaAimTarget(candidates: AimCandidate[]): AimResolution | null {
  let best: AimResolution | null = null;
  for (const c of candidates) {
    const distance = Math.hypot(c.x, c.y);
    if (distance > ARENA.aimMaxRadius) continue;
    if (!best || distance < best.distance) best = { ...c, distance, hit: distance <= ARENA.hitRadius };
  }
  return best;
}

/** Whole seconds left before `endsAt` (never negative). */
export function arenaSecondsLeft(endsAt: number | null, now: number): number {
  if (endsAt === null) return 0;
  return Math.max(0, Math.ceil((endsAt - now) / 1000));
}

/** A good food blinks during its last `ARENA.bonusBlinkSeconds`. */
export function arenaBonusBlinking(expiresAt: number, now: number): boolean {
  return expiresAt - now <= ARENA.bonusBlinkSeconds * 1000;
}
