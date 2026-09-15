import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import type { ArTarget } from "@/components/ar/types";
import { getOutfit, outfitToEquipped } from "@/lib/accessories/service";
import { DomainError } from "@/lib/api/errors";
import { getHeldCreatures } from "@/lib/boarding/service";
import { tickCreature } from "@/lib/creatures/tick-service";
import { getDb } from "@/lib/db";
import { creatures, type Creature } from "@/lib/db/schema";
import { acceptedFriendIds, publicProfiles } from "@/lib/friends/service";
import { deriveState } from "@/lib/game/creature-view";
import { stageForXp } from "@/lib/game/growth";
import type { GameRules } from "@/lib/game/rules";
import { getGameRules } from "@/lib/game/rules-service";
import { pickMarkerId } from "./assign";
import { isMarkerId } from "./config";

/** Marker numbers already used by the creatures of these users (living or not: a dead creature's paper may still be around). */
async function markersUsedBy(userIds: string[]): Promise<Set<number>> {
  if (userIds.length === 0) return new Set();
  const rows = await getDb()
    .select({ marker: creatures.arMarker })
    .from(creatures)
    .where(and(inArray(creatures.userId, userIds), isNotNull(creatures.arMarker)));
  return new Set(rows.map((r) => r.marker).filter(isMarkerId));
}

/**
 * The creature's marker number, assigned on first use: a number not used by
 * the owner's other creatures nor by their friends' (the ones likely to sit
 * on the same table). Concurrent first calls agree through the conditional
 * update.
 */
export async function ensureCreatureMarker(creature: Creature, random: () => number = Math.random): Promise<number> {
  if (isMarkerId(creature.arMarker)) return creature.arMarker;
  const taken = await markersUsedBy([creature.userId, ...(await acceptedFriendIds(creature.userId))]);
  const chosen = pickMarkerId(taken, random);
  const rows = await getDb()
    .update(creatures)
    .set({ arMarker: chosen })
    .where(and(eq(creatures.id, creature.id), sql`${creatures.arMarker} IS NULL`))
    .returning({ marker: creatures.arMarker });
  if (rows.length > 0 && isMarkerId(rows[0].marker)) return rows[0].marker;
  const [current] = await getDb().select({ marker: creatures.arMarker }).from(creatures).where(eq(creatures.id, creature.id));
  if (!current || !isMarkerId(current.marker)) throw new DomainError("marker_unavailable", "Impossible d'attribuer un marqueur pour le moment.", 500);
  return current.marker;
}

/** A living, named creature as the AR screen draws it (accessories included). */
async function targetFor(creature: Creature, markerId: number, mine: boolean, ownerName: string | null): Promise<ArTarget | null> {
  if (creature.status !== "alive" || !creature.speciesId || !creature.name) return null;
  const outfit = await getOutfit(creature.id);
  return {
    markerId,
    mine,
    ownerName,
    creature: { name: creature.name, speciesId: creature.speciesId, stage: stageForXp(creature.xp).id, state: deriveState(creature), accessories: outfitToEquipped(outfit) },
  };
}

export type ArTargets = {
  targets: ArTarget[];
  /** The viewer's own creature, when it can be shown (marker assigned on the way), and its id for the PDF link. */
  own: (ArTarget & { creatureId: string }) | null;
  /** Names of creatures hidden because another one uses the same marker number (own > boarded > friends). */
  conflicts: string[];
};

/**
 * Everything the viewer's camera may recognise (spec § 3.19): their own
 * creature (even away at a friend's), the creatures boarded with them and
 * their accepted friends' living creatures that already have a marker. One
 * target per marker number.
 */
export async function listArTargets(userId: string, now: Date = new Date(), rules?: GameRules): Promise<ArTargets> {
  const gameRules = rules ?? (await getGameRules());
  const held = await getHeldCreatures(userId, now, gameRules);
  const candidates: ArTarget[] = [];

  let own: ArTargets["own"] = null;
  if (held.own && held.own.status === "alive" && held.own.name) {
    const markerId = await ensureCreatureMarker(held.own);
    const target = await targetFor(held.own, markerId, true, null);
    if (target) {
      own = { ...target, creatureId: held.own.id };
      candidates.push(target);
    }
  }

  for (const boarded of held.boarded) {
    if (!isMarkerId(boarded.creature.arMarker)) continue;
    const target = await targetFor(boarded.creature, boarded.creature.arMarker, false, boarded.owner.username);
    if (target) candidates.push(target);
  }

  const friendIds = await acceptedFriendIds(userId);
  if (friendIds.length > 0) {
    const rows = await getDb()
      .select()
      .from(creatures)
      .where(and(inArray(creatures.userId, friendIds), eq(creatures.status, "alive"), isNotNull(creatures.arMarker)));
    const names = await publicProfiles(rows.map((r) => r.userId));
    for (const row of rows) {
      if (!isMarkerId(row.arMarker) || candidates.some((c) => c.creature.name === row.name && c.ownerName === names.get(row.userId)?.username)) continue;
      const ticked = await tickCreature(row, now, gameRules);
      const target = await targetFor(ticked, row.arMarker, false, names.get(row.userId)?.username ?? "Un ami");
      if (target) candidates.push(target);
    }
  }

  const byMarker = new Map<number, ArTarget>();
  const conflicts: string[] = [];
  for (const target of candidates) {
    if (byMarker.has(target.markerId)) conflicts.push(target.creature.name ?? "Une créature");
    else byMarker.set(target.markerId, target);
  }
  return { targets: [...byMarker.values()], own, conflicts };
}

/** The viewer's own creature by id, for the marker PDF (never someone else's). */
export async function ownCreatureById(userId: string, creatureId: string): Promise<Creature | null> {
  const rows = await getDb().select().from(creatures).where(and(eq(creatures.id, creatureId), eq(creatures.userId, userId))).limit(1);
  return rows[0] ?? null;
}
