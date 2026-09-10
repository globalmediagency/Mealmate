import type { Creature } from "@/lib/db/schema";
import { HEALTH_STATE, SHOP_ITEMS, TALISMAN_PROTECTION_DAYS, type ShopItemId } from "./config";

const DAY_MS = 86_400_000;

export const SHOP_ITEM_IDS = Object.keys(SHOP_ITEMS) as ShopItemId[];

export function isShopItem(value: string): value is ShopItemId {
  return (SHOP_ITEM_IDS as string[]).includes(value);
}

/** Care items restore health right away; the talisman only protects from death. */
export const MEDICINE = {
  siropHealthGain: 30,
} as const;

export type MedicineResult = {
  creature: Creature;
  /** Health gained (0 for the talisman). */
  healthDelta: number;
  /** True when the item cured the sickness (health back above the "tired" line). */
  cured: boolean;
  /** New protection end, when a talisman was applied. */
  protectedUntil: Date | null;
};

/**
 * Pure effect of a shop item on a living creature (spec § 3.9):
 * - sirop: +30 health (capped at 100)
 * - antibiotique: health = 100 and sickness ends
 * - talisman: no death for 7 days (extends an active protection)
 */
export function applyMedicine(creature: Creature, item: ShopItemId, now: Date = new Date()): MedicineResult {
  if (creature.status !== "alive") return { creature, healthDelta: 0, cured: false, protectedUntil: null };
  const wasSick = creature.sickSince !== null;

  if (item === "talisman") {
    const base = creature.protectedUntil && creature.protectedUntil > now ? creature.protectedUntil : now;
    const protectedUntil = new Date(base.getTime() + TALISMAN_PROTECTION_DAYS * DAY_MS);
    return { creature: { ...creature, protectedUntil }, healthDelta: 0, cured: false, protectedUntil };
  }

  const target = item === "antibiotique" ? 100 : Math.min(100, creature.health + MEDICINE.siropHealthGain);
  const health = Math.round(target * 10) / 10;
  // Mirror the tick bookkeeping: sickness ends once health is back above the "tired" line.
  const sickSince = health < HEALTH_STATE.tiredMin ? creature.sickSince : null;
  return {
    creature: { ...creature, health, sickSince },
    healthDelta: Math.round((health - creature.health) * 10) / 10,
    cured: wasSick && sickSince === null,
    protectedUntil: null,
  };
}

/** Whether the item would have any effect right now (used to avoid wasting a dose). */
export function medicineIsUseful(creature: Creature, item: ShopItemId): boolean {
  if (creature.status !== "alive") return false;
  if (item === "talisman") return true;
  return creature.health < 100;
}

/** "Mal en point": a friend may send medicine only to a tired or sick creature. */
export function needsCare(creature: Pick<Creature, "status" | "health">): boolean {
  return creature.status === "alive" && creature.health < HEALTH_STATE.healthyMin;
}

export function formatPrice(cents: number): string {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100);
}
