import { and, eq, inArray, sql } from "drizzle-orm";
import { DomainError } from "@/lib/api/errors";
import { getDb } from "@/lib/db";
import { creatureOutfits, creatures, userAccessories, type Creature } from "@/lib/db/schema";
import { chestStatus, drawAccessory, type ChestStatus } from "@/lib/game/accessories";
import { getDropWeights } from "@/lib/game/drops-service";
import { gameDate } from "@/lib/game/time";
import { creatureStepsSince } from "@/lib/boarding/custody-service";
import { getAccessory, SLOTS, type Accessory, type Slot } from "./catalog";

export type OwnedAccessory = { accessory: Accessory; obtainedAt: Date; qty: number };
export type Outfit = Partial<Record<Slot, string>>;
export type EquippedAccessory = { slot: Slot; id: string };

export async function getOwnedAccessories(userId: string): Promise<OwnedAccessory[]> {
  const rows = await getDb().select().from(userAccessories).where(and(eq(userAccessories.userId, userId), sql`${userAccessories.qty} > 0`));
  return rows
    .map((row) => {
      const accessory = getAccessory(row.accessoryId);
      return accessory ? { accessory, obtainedAt: row.obtainedAt, qty: row.qty } : null;
    })
    .filter((item): item is OwnedAccessory => item !== null)
    .sort((a, b) => b.obtainedAt.getTime() - a.obtainedAt.getTime());
}

/** Adds `count` copies of an accessory to a user (creates the row on the first one). Returns the new total. */
export async function addAccessoryCopies(userId: string, accessoryId: string, count = 1, now = new Date()): Promise<number> {
  const rows = await getDb()
    .insert(userAccessories)
    .values({ userId, accessoryId, qty: count, obtainedAt: now })
    .onConflictDoUpdate({ target: [userAccessories.userId, userAccessories.accessoryId], set: { qty: sql`${userAccessories.qty} + ${count}` } })
    .returning({ qty: userAccessories.qty });
  return rows[0]?.qty ?? count;
}

/**
 * Removes one copy (conditional decrement). When the last copy leaves, the row
 * is deleted (only if still at 0: a copy arriving in between survives) and the
 * accessory is unequipped from the user's creatures. Returns the copies left.
 */
export async function takeAccessoryCopy(userId: string, accessoryId: string): Promise<number> {
  const db = getDb();
  const rows = await db
    .update(userAccessories)
    .set({ qty: sql`${userAccessories.qty} - 1` })
    .where(and(eq(userAccessories.userId, userId), eq(userAccessories.accessoryId, accessoryId), sql`${userAccessories.qty} > 0`))
    .returning({ qty: userAccessories.qty });
  if (rows.length === 0) throw new DomainError("not_owned", "Tu ne possèdes pas cet accessoire.", 403);
  const left = rows[0].qty;
  if (left <= 0) {
    const removed = await db
      .delete(userAccessories)
      .where(and(eq(userAccessories.userId, userId), eq(userAccessories.accessoryId, accessoryId), sql`${userAccessories.qty} <= 0`))
      .returning({ id: userAccessories.accessoryId });
    if (removed.length > 0) {
      const owned = await db.select({ id: creatures.id }).from(creatures).where(eq(creatures.userId, userId));
      if (owned.length > 0) {
        await db.delete(creatureOutfits).where(and(inArray(creatureOutfits.creatureId, owned.map((c) => c.id)), eq(creatureOutfits.accessoryId, accessoryId)));
      }
    }
  }
  return left;
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
    .where(and(eq(userAccessories.userId, userId), eq(userAccessories.accessoryId, accessoryId), sql`${userAccessories.qty} > 0`))
    .limit(1);
  if (owned.length === 0) throw new DomainError("not_owned", "Tu ne possèdes pas encore cet accessoire.", 403);
  await db
    .insert(creatureOutfits)
    .values({ creatureId: creature.id, slot, accessoryId })
    .onConflictDoUpdate({ target: [creatureOutfits.creatureId, creatureOutfits.slot], set: { accessoryId } });
  return getOutfit(creature.id);
}

/** Chest status for a living creature: the holder's steps since the hatch day (the host's during a stay at a friend's). */
export async function getChestStatus(creature: Creature): Promise<ChestStatus> {
  if (creature.status !== "alive" || !creature.hatchedAt) return chestStatus(0, 0);
  const total = await creatureStepsSince(creature, gameDate(creature.hatchedAt));
  return chestStatus(total, creature.accessoryDrops);
}

/** Options shared by actions a host may perform on a creature entrusted to them. */
export type HolderOptions = {
  /** The creature is boarded with `userId` (checked by the caller through `getHeldCreature`). */
  boarded?: boolean;
};

export function assertHolder(userId: string, creature: Creature, options: HolderOptions = {}): void {
  if (!options.boarded && creature.userId !== userId) throw new DomainError("forbidden", "Cette créature n'est pas la tienne.", 403);
}

export type ChestReward = {
  accessory: Accessory;
  /** Already owned: this chest adds a copy (to trade or give away). */
  duplicate: boolean;
  /** Copies owned after this chest. */
  copies: number;
  /** The creature already wears this very accessory (nothing to equip). */
  equipped: boolean;
  status: ChestStatus;
};

/** Opens one earned chest: draws an accessory with the admin-tunable weights; a duplicate adds a copy. The opener (owner or host) keeps it. */
export async function openChest(userId: string, creature: Creature, random?: () => number, options: HolderOptions = {}): Promise<ChestReward> {
  assertHolder(userId, creature, options);
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

  const [ownedList, weights, outfit] = await Promise.all([getOwnedAccessories(userId), getDropWeights(), getOutfit(creature.id)]);
  const owned = new Set(ownedList.map((o) => o.accessory.id));
  const draw = drawAccessory(owned, random, weights.accessories);
  const copies = await addAccessoryCopies(userId, draw.accessory.id);
  return {
    accessory: draw.accessory,
    duplicate: draw.duplicate,
    copies,
    equipped: outfit[draw.accessory.slot] === draw.accessory.id,
    status: chestStatus(status.totalSteps, creature.accessoryDrops + 1),
  };
}
