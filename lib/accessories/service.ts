import { and, eq, sql } from "drizzle-orm";
import { DomainError } from "@/lib/api/errors";
import { getDb } from "@/lib/db";
import { creatureOutfits, creatures, userAccessories, type Creature } from "@/lib/db/schema";
import { chestStatus, drawAccessory, type ChestStatus } from "@/lib/game/accessories";
import { gameDate } from "@/lib/game/time";
import { sumStepsSince } from "@/lib/steps/service";
import { getAccessory, SLOTS, type Accessory, type Slot } from "./catalog";

export type OwnedAccessory = { accessory: Accessory; obtainedAt: Date };
export type Outfit = Partial<Record<Slot, string>>;
export type EquippedAccessory = { slot: Slot; id: string };

export async function getOwnedAccessories(userId: string): Promise<OwnedAccessory[]> {
  const rows = await getDb().select().from(userAccessories).where(eq(userAccessories.userId, userId));
  return rows
    .map((row) => {
      const accessory = getAccessory(row.accessoryId);
      return accessory ? { accessory, obtainedAt: row.obtainedAt } : null;
    })
    .filter((item): item is OwnedAccessory => item !== null)
    .sort((a, b) => b.obtainedAt.getTime() - a.obtainedAt.getTime());
}

export async function getOutfit(creatureId: string): Promise<Outfit> {
  const rows = await getDb().select().from(creatureOutfits).where(eq(creatureOutfits.creatureId, creatureId));
  const outfit: Outfit = {};
  for (const row of rows) if (getAccessory(row.accessoryId)) outfit[row.slot as Slot] = row.accessoryId;
  return outfit;
}

export function outfitToEquipped(outfit: Outfit): EquippedAccessory[] {
  return SLOTS.flatMap((slot) => (outfit[slot] ? [{ slot, id: outfit[slot]! }] : []));
}

/** Equips (or removes with `accessoryId = null`) an owned accessory on the user's creature. */
export async function equipAccessory(userId: string, creature: Creature, slot: Slot, accessoryId: string | null): Promise<Outfit> {
  if (creature.userId !== userId) throw new DomainError("forbidden", "Cette créature n'est pas la tienne.", 403);
  if (creature.status !== "alive") throw new DomainError("no_creature", "Seule une créature vivante peut être habillée.", 409);
  const db = getDb();
  if (accessoryId === null) {
    await db.delete(creatureOutfits).where(and(eq(creatureOutfits.creatureId, creature.id), eq(creatureOutfits.slot, slot)));
    return getOutfit(creature.id);
  }
  const accessory = getAccessory(accessoryId);
  if (!accessory) throw new DomainError("unknown_accessory", "Accessoire inconnu.", 404);
  if (accessory.slot !== slot) throw new DomainError("wrong_slot", "Cet accessoire ne va pas à cet emplacement.", 400);
  const owned = await db
    .select({ id: userAccessories.accessoryId })
    .from(userAccessories)
    .where(and(eq(userAccessories.userId, userId), eq(userAccessories.accessoryId, accessoryId)))
    .limit(1);
  if (owned.length === 0) throw new DomainError("not_owned", "Tu ne possèdes pas encore cet accessoire.", 403);
  await db
    .insert(creatureOutfits)
    .values({ creatureId: creature.id, slot, accessoryId })
    .onConflictDoUpdate({ target: [creatureOutfits.creatureId, creatureOutfits.slot], set: { accessoryId } });
  return getOutfit(creature.id);
}

/** Chest status for a living creature (steps since the hatch day, all sources). */
export async function getChestStatus(creature: Creature): Promise<ChestStatus> {
  if (creature.status !== "alive" || !creature.hatchedAt) return chestStatus(0, 0);
  const total = await sumStepsSince(creature.userId, gameDate(creature.hatchedAt));
  return chestStatus(total, creature.accessoryDrops);
}

export type ChestReward = {
  accessory: Accessory;
  duplicate: boolean;
  xpGain: number;
  status: ChestStatus;
};

/** Opens one earned chest: draws an accessory (or +20 XP on duplicate). */
export async function openChest(userId: string, creature: Creature, random?: () => number): Promise<ChestReward> {
  if (creature.userId !== userId) throw new DomainError("forbidden", "Cette créature n'est pas la tienne.", 403);
  const status = await getChestStatus(creature);
  if (status.available <= 0) {
    throw new DomainError("no_chest", `Encore ${status.stepsToNext.toLocaleString("fr-FR")} pas avant le prochain coffre.`, 409);
  }
  const db = getDb();
  // Claim the chest first (guarded on the current drop count to avoid double opening).
  const claimed = await db
    .update(creatures)
    .set({ accessoryDrops: creature.accessoryDrops + 1 })
    .where(and(eq(creatures.id, creature.id), eq(creatures.accessoryDrops, creature.accessoryDrops)))
    .returning({ drops: creatures.accessoryDrops });
  if (claimed.length === 0) throw new DomainError("no_chest", "Ce coffre a déjà été ouvert.", 409);

  const owned = new Set((await getOwnedAccessories(userId)).map((o) => o.accessory.id));
  const draw = drawAccessory(owned, random);
  if (draw.duplicate) {
    await db.update(creatures).set({ xp: sql`${creatures.xp} + ${draw.xpGain}` }).where(eq(creatures.id, creature.id));
  } else {
    await db.insert(userAccessories).values({ userId, accessoryId: draw.accessory.id }).onConflictDoNothing();
  }
  return {
    accessory: draw.accessory,
    duplicate: draw.duplicate,
    xpGain: draw.xpGain,
    status: chestStatus(status.totalSteps, creature.accessoryDrops + 1),
  };
}
