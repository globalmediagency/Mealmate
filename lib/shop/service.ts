import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { DomainError } from "@/lib/api/errors";
import { getActiveCreature } from "@/lib/creatures/service";
import { tickCreature } from "@/lib/creatures/tick-service";
import { getDb } from "@/lib/db";
import { creatures, gifts, inventory, profiles, purchases, type Creature } from "@/lib/db/schema";
import { SHOP_ITEMS, type ShopItemId } from "@/lib/game/config";
import { applyMedicine, isShopItem, medicineIsUseful, needsCare, SHOP_ITEM_IDS, type MedicineResult } from "@/lib/game/medicine";
import { getGameRules } from "@/lib/game/rules-service";
import { getAcceptedFriend, type PublicProfile } from "@/lib/friends/service";
import type { CheckoutProvider } from "./provider";

export type Inventory = Record<ShopItemId, number>;

const emptyInventory = (): Inventory => ({ sirop: 0, antibiotique: 0, talisman: 0 });

export async function getInventory(userId: string): Promise<Inventory> {
  const rows = await getDb().select().from(inventory).where(eq(inventory.userId, userId));
  const result = emptyInventory();
  for (const row of rows) if (isShopItem(row.item)) result[row.item] = row.qty;
  return result;
}

export function totalDoses(inv: Inventory): number {
  return SHOP_ITEM_IDS.reduce((sum, id) => sum + inv[id], 0);
}

async function addToInventory(userId: string, item: string, qty: number): Promise<void> {
  await getDb()
    .insert(inventory)
    .values({ userId, item, qty })
    .onConflictDoUpdate({ target: [inventory.userId, inventory.item], set: { qty: sql`${inventory.qty} + ${qty}` } });
}

/** Takes one dose out of the user's inventory; 409 when the shelf is empty. */
async function consumeDose(userId: string, item: ShopItemId): Promise<void> {
  const rows = await getDb()
    .update(inventory)
    .set({ qty: sql`${inventory.qty} - 1` })
    .where(and(eq(inventory.userId, userId), eq(inventory.item, item), sql`${inventory.qty} > 0`))
    .returning({ qty: inventory.qty });
  if (rows.length === 0) throw new DomainError("no_stock", `Tu n'as plus de ${SHOP_ITEMS[item].label.toLowerCase()}. Passe par la boutique.`, 409);
}

// ---------------------------------------------------------------------------
// Checkout
// ---------------------------------------------------------------------------

/** Starts a checkout session and records the pending purchase. Returns the redirect URL. */
export async function createCheckout(userId: string, item: ShopItemId, origin: string, provider: CheckoutProvider): Promise<{ url: string; sessionId: string }> {
  const product = SHOP_ITEMS[item];
  const session = await provider.createSession({
    userId,
    item,
    label: product.label,
    description: product.description,
    amountCents: product.priceCents,
    successUrl: `${origin}/shop?success=1&session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${origin}/shop?cancelled=1`,
  });
  await getDb()
    .insert(purchases)
    .values({ userId, stripeSessionId: session.id, item, amountCents: product.priceCents, status: "pending" })
    .onConflictDoNothing();
  return { url: session.url, sessionId: session.id };
}

export type CreditOutcome = { credited: boolean; userId: string | null; item: string | null };

/**
 * Marks a purchase as paid and adds the item to the inventory. Idempotent:
 * called by the webhook AND by the success page, only the first call credits.
 */
export async function creditPurchase(input: { sessionId: string; userId?: string | null; item?: string | null; amountCents?: number | null }): Promise<CreditOutcome> {
  const db = getDb();
  const flipped = await db
    .update(purchases)
    .set({ status: "paid" })
    .where(and(eq(purchases.stripeSessionId, input.sessionId), eq(purchases.status, "pending")))
    .returning({ userId: purchases.userId, item: purchases.item });
  let row = flipped[0] ?? null;
  if (!row) {
    // Pending row missing (webhook faster than our insert, or lost): record it from the provider data.
    if (!input.userId || !input.item || !isShopItem(input.item)) return { credited: false, userId: null, item: null };
    const inserted = await db
      .insert(purchases)
      .values({ userId: input.userId, stripeSessionId: input.sessionId, item: input.item, amountCents: input.amountCents ?? SHOP_ITEMS[input.item].priceCents, status: "paid" })
      .onConflictDoNothing()
      .returning({ userId: purchases.userId, item: purchases.item });
    row = inserted[0] ?? null;
  }
  if (!row) return { credited: false, userId: input.userId ?? null, item: input.item ?? null };
  if (!isShopItem(row.item)) return { credited: false, userId: row.userId, item: row.item };
  await addToInventory(row.userId, row.item, 1);
  return { credited: true, userId: row.userId, item: row.item };
}

export type ConfirmOutcome = { status: "paid" | "pending" | "cancelled" | "unknown"; item: ShopItemId | null; credited: boolean };

/** Success-page fallback when the webhook has not (yet) run. Only the buyer may confirm. */
export async function confirmCheckout(userId: string, sessionId: string, provider: CheckoutProvider): Promise<ConfirmOutcome> {
  const db = getDb();
  const [purchase] = await db.select().from(purchases).where(eq(purchases.stripeSessionId, sessionId)).limit(1);
  if (purchase && purchase.userId !== userId) throw new DomainError("forbidden", "Cet achat n'est pas le tien.", 403);
  const item = purchase && isShopItem(purchase.item) ? purchase.item : null;
  if (purchase?.status === "paid") return { status: "paid", item, credited: false };

  const info = await provider.retrieveSession(sessionId);
  if (!info) return { status: "unknown", item, credited: false };
  if (info.userId && info.userId !== userId) throw new DomainError("forbidden", "Cet achat n'est pas le tien.", 403);
  if (info.paid) {
    const outcome = await creditPurchase({ sessionId, userId: info.userId ?? userId, item: info.item, amountCents: info.amountCents });
    const creditedItem = outcome.item && isShopItem(outcome.item) ? outcome.item : item;
    return { status: "paid", item: creditedItem, credited: outcome.credited };
  }
  if (info.expired) {
    await db.update(purchases).set({ status: "cancelled" }).where(and(eq(purchases.stripeSessionId, sessionId), eq(purchases.status, "pending")));
    return { status: "cancelled", item, credited: false };
  }
  return { status: "pending", item, credited: false };
}

export type PurchaseView = { id: string; item: ShopItemId; amountCents: number; status: string; createdAt: string };

export async function listPurchases(userId: string, limit = 10): Promise<PurchaseView[]> {
  const rows = await getDb().select().from(purchases).where(eq(purchases.userId, userId)).orderBy(desc(purchases.createdAt)).limit(limit);
  return rows
    .filter((r) => isShopItem(r.item))
    .map((r) => ({ id: r.id, item: r.item as ShopItemId, amountCents: r.amountCents, status: r.status, createdAt: r.createdAt.toISOString() }));
}

// ---------------------------------------------------------------------------
// Using medicine
// ---------------------------------------------------------------------------

async function persistMedicine(creature: Creature): Promise<Creature> {
  const rows = await getDb()
    .update(creatures)
    .set({ health: creature.health, sickSince: creature.sickSince, protectedUntil: creature.protectedUntil })
    .where(and(eq(creatures.id, creature.id), eq(creatures.status, "alive")))
    .returning();
  if (!rows[0]) throw new DomainError("no_creature", "Cette créature n'est plus là.", 409);
  return rows[0];
}

export type UseOutcome = MedicineResult & { inventory: Inventory };

/** Applies one dose of `item` to the user's own living creature. */
export async function consumeMedicine(userId: string, creature: Creature, item: ShopItemId, now: Date = new Date()): Promise<UseOutcome> {
  if (creature.userId !== userId) throw new DomainError("forbidden", "Cette créature n'est pas la tienne.", 403);
  if (creature.status !== "alive") throw new DomainError("no_creature", "Il faut une créature vivante pour la soigner.", 409);
  if (!medicineIsUseful(creature, item)) throw new DomainError("not_needed", `${creature.name ?? "Ta créature"} est déjà en pleine forme : garde ce ${SHOP_ITEMS[item].label.toLowerCase()} pour plus tard.`, 409);
  await consumeDose(userId, item);
  const result = applyMedicine(creature, item, now);
  const saved = await persistMedicine(result.creature);
  return { ...result, creature: saved, inventory: await getInventory(userId) };
}

export type HealFriendOutcome = MedicineResult & { friend: PublicProfile; creatureName: string | null; inventory: Inventory };

/** Sends one dose from the user's inventory to a friend's tired or sick creature. */
export async function healFriendCreature(userId: string, friendshipId: string, item: ShopItemId, now: Date = new Date()): Promise<HealFriendOutcome> {
  const { friend } = await getAcceptedFriend(userId, friendshipId);
  const active = await getActiveCreature(friend.userId);
  if (!active || active.status !== "alive") throw new DomainError("no_creature", `${friend.username} n'a pas de créature à soigner en ce moment.`, 409);
  const creature = await tickCreature(active, now, await getGameRules());
  if (creature.status !== "alive") throw new DomainError("no_creature", `La créature de ${friend.username} n'est plus là…`, 409);
  if (!needsCare(creature)) throw new DomainError("not_needed", `${creature.name ?? "La créature"} de ${friend.username} va bien : garde ta dose pour un ami mal en point.`, 409);
  await consumeDose(userId, item);
  const result = applyMedicine(creature, item, now);
  const saved = await persistMedicine(result.creature);
  await getDb().insert(gifts).values({ fromUserId: userId, toUserId: friend.userId, creatureId: creature.id, item });
  return { ...result, creature: saved, friend, creatureName: creature.name, inventory: await getInventory(userId) };
}

// ---------------------------------------------------------------------------
// Gifts received
// ---------------------------------------------------------------------------

export type GiftView = { id: string; from: PublicProfile; item: ShopItemId; createdAt: string };

/** Medicine received and not yet acknowledged on the home screen. */
export async function listUnseenGifts(userId: string): Promise<GiftView[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(gifts)
    .where(and(eq(gifts.toUserId, userId), isNull(gifts.seenAt)))
    .orderBy(desc(gifts.createdAt))
    .limit(20);
  if (rows.length === 0) return [];
  const senders = await db.select().from(profiles).where(inArray(profiles.userId, [...new Set(rows.map((r) => r.fromUserId))]));
  const byId = new Map(senders.map((p) => [p.userId, { userId: p.userId, username: p.username }]));
  return rows.flatMap((r) => {
    const from = byId.get(r.fromUserId);
    return from && isShopItem(r.item) ? [{ id: r.id, from, item: r.item, createdAt: r.createdAt.toISOString() }] : [];
  });
}

export async function markGiftsSeen(userId: string, now: Date = new Date()): Promise<void> {
  await getDb().update(gifts).set({ seenAt: now }).where(and(eq(gifts.toUserId, userId), isNull(gifts.seenAt)));
}
