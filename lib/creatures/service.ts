import { and, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { z } from "zod";
import { DomainError } from "@/lib/api/errors";
import { getDb } from "@/lib/db";
import { creatures, type Creature } from "@/lib/db/schema";
import { CREATURE_NAME, TIERS, type Tier } from "@/lib/game/config";
import { drawSpecies } from "@/lib/game/rarity";
import type { GameRules } from "@/lib/game/rules";
import { getGameRules } from "@/lib/game/rules-service";
import { gameDate } from "@/lib/game/time";
import { sumStepsSince } from "@/lib/steps/service";
import { isTierPlayable } from "./index";
import { tickCreature } from "./tick-service";

export const tierSchema = z.enum(TIERS);

export const creatureNameSchema = z
  .string()
  .trim()
  .min(CREATURE_NAME.min, `Le nom doit faire au moins ${CREATURE_NAME.min} caractères.`)
  .max(CREATURE_NAME.max, `Le nom doit faire au plus ${CREATURE_NAME.max} caractères.`)
  .regex(/^[\p{L}\p{N} '\-]+$/u, "Le nom ne peut contenir que des lettres, chiffres, espaces, apostrophes et tirets.");

/** The user's egg or living creature, if any. */
export async function getActiveCreature(userId: string): Promise<Creature | null> {
  const rows = await getDb()
    .select()
    .from(creatures)
    .where(and(eq(creatures.userId, userId), inArray(creatures.status, ["egg", "alive"])))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * The user's egg or living creature with the lazy tick applied. A creature
 * that died during this tick is returned with `status = "dead"` so callers
 * can show the mourning screen.
 */
export async function getActiveCreatureTicked(userId: string, now: Date = new Date(), rules?: GameRules): Promise<Creature | null> {
  const creature = await getActiveCreature(userId);
  if (!creature) return null;
  return creature.status === "alive" ? tickCreature(creature, now, rules) : creature;
}

/** Most recent dead creature whose death has not been acknowledged yet. */
export async function getUnmournedDeath(userId: string): Promise<Creature | null> {
  const rows = await getDb()
    .select()
    .from(creatures)
    .where(and(eq(creatures.userId, userId), eq(creatures.status, "dead"), isNull(creatures.mournedAt)))
    .orderBy(desc(creatures.diedAt))
    .limit(1);
  return rows[0] ?? null;
}

/** Marks every death of the user as acknowledged. */
export async function mournCreatures(userId: string, now: Date = new Date()): Promise<void> {
  await getDb()
    .update(creatures)
    .set({ mournedAt: now })
    .where(and(eq(creatures.userId, userId), eq(creatures.status, "dead"), isNull(creatures.mournedAt)));
}

/** All dead creatures of the user, most recent first (cemetery). */
export async function getDeadCreatures(userId: string): Promise<Creature[]> {
  return getDb()
    .select()
    .from(creatures)
    .where(and(eq(creatures.userId, userId), eq(creatures.status, "dead")))
    .orderBy(desc(creatures.diedAt));
}

/** Creates a new egg. Steps already walked today count toward hatching. */
export async function createEgg(userId: string, tier: Tier): Promise<Creature> {
  if (!isTierPlayable(tier)) {
    throw new DomainError("tier_unavailable", "Ce niveau n'est pas encore disponible.", 400);
  }
  const existing = await getActiveCreature(userId);
  if (existing) {
    throw new DomainError("creature_exists", "Tu as déjà un œuf ou une créature.", 409);
  }
  const eggSteps = await sumStepsSince(userId, gameDate());
  const rows = await getDb()
    .insert(creatures)
    .values({ userId, tier, status: "egg", eggSteps })
    .returning();
  return rows[0];
}

/** Recomputes the egg's cumulated steps since the day it was chosen. */
export async function refreshEggSteps(creature: Creature): Promise<Creature> {
  if (creature.status !== "egg") return creature;
  const eggSteps = await sumStepsSince(creature.userId, gameDate(creature.createdAt));
  if (eggSteps === creature.eggSteps) return creature;
  const rows = await getDb()
    .update(creatures)
    .set({ eggSteps })
    .where(eq(creatures.id, creature.id))
    .returning();
  return rows[0] ?? creature;
}

/** Hatches the egg: draws the species server-side and brings the creature to life. */
export async function hatchEgg(userId: string, now: Date = new Date()): Promise<Creature> {
  const active = await getActiveCreature(userId);
  if (!active || active.status !== "egg") {
    throw new DomainError("no_egg", "Tu n'as pas d'œuf à faire éclore.", 409);
  }
  const egg = await refreshEggSteps(active);
  const tier = egg.tier as Tier;
  const rules = await getGameRules();
  if (egg.eggSteps < rules.tiers[tier].hatchSteps) {
    throw new DomainError("egg_not_ready", "L'œuf a encore besoin de pas pour éclore.", 409);
  }
  const species = drawSpecies(tier);
  const rows = await getDb()
    .update(creatures)
    .set({
      status: "alive",
      speciesId: species.id,
      rarity: species.rarity,
      hatchedAt: now,
      lastTickAt: now,
      health: 100,
      hunger: 0,
      mood: 100,
      xp: 0,
      sickSince: null,
    })
    .where(and(eq(creatures.id, egg.id), eq(creatures.status, "egg")))
    .returning();
  if (!rows[0]) {
    throw new DomainError("no_egg", "L'œuf a déjà éclos.", 409);
  }
  return rows[0];
}

/** Gives the newborn its name (only once). */
export async function nameCreature(userId: string, name: string): Promise<Creature> {
  const active = await getActiveCreature(userId);
  if (!active || active.status !== "alive") {
    throw new DomainError("no_creature", "Tu n'as pas de créature à nommer.", 409);
  }
  if (active.name) {
    throw new DomainError("already_named", `Ta créature s'appelle déjà ${active.name}.`, 409);
  }
  const rows = await getDb()
    .update(creatures)
    .set({ name })
    .where(eq(creatures.id, active.id))
    .returning();
  return rows[0];
}

/** Species already hatched by this account (alive or dead), for the collection. */
export async function getObtainedSpeciesIds(userId: string): Promise<string[]> {
  const rows = await getDb()
    .selectDistinct({ speciesId: creatures.speciesId })
    .from(creatures)
    .where(and(eq(creatures.userId, userId), isNotNull(creatures.speciesId)));
  return rows.map((row) => row.speciesId).filter((id): id is string => Boolean(id));
}

/** Applies walking effects to a living creature (health capped at 100). */
export async function applyStepGains(
  creature: Creature,
  gains: { healthGain: number; xpGain: number },
): Promise<Creature> {
  if (creature.status !== "alive" || (gains.healthGain <= 0 && gains.xpGain <= 0)) return creature;
  const rows = await getDb()
    .update(creatures)
    .set({
      health: Math.min(100, creature.health + gains.healthGain),
      xp: creature.xp + gains.xpGain,
    })
    .where(eq(creatures.id, creature.id))
    .returning();
  return rows[0] ?? creature;
}
