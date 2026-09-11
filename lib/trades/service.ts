import { and, desc, eq, gt, inArray, or, sql } from "drizzle-orm";
import { addAccessoryCopies, getOwnedAccessories, takeAccessoryCopy } from "@/lib/accessories/service";
import { getAccessory, type Accessory } from "@/lib/accessories/catalog";
import { RARITIES } from "@/lib/game/config";
import { DomainError } from "@/lib/api/errors";
import { getDb } from "@/lib/db";
import { gifts, profiles, trades, type Trade } from "@/lib/db/schema";
import { getAcceptedFriend, type PublicProfile } from "@/lib/friends/service";

const MAX_PENDING_OUTGOING = 10;
const HISTORY_DAYS = 7;

async function ownedCounts(userId: string): Promise<Map<string, number>> {
  return new Map((await getOwnedAccessories(userId)).map((o) => [o.accessory.id, o.qty]));
}

export type OwnedItem = { accessory: Accessory; qty: number };

export type TradeableAccessories = {
  friend: PublicProfile;
  /** Everything the friend owns (with copies): what I can ask for. */
  theirs: OwnedItem[];
  /** Everything I own (with copies): what I can offer or give away. */
  mine: OwnedItem[];
};

const byRarityThenName = (a: OwnedItem, b: OwnedItem) =>
  RARITIES.indexOf(a.accessory.rarity) - RARITIES.indexOf(b.accessory.rarity) || a.accessory.name.localeCompare(b.accessory.name, "fr");

/** Both wardrobes, copies included: with copies allowed, any owned item can change hands. */
export async function tradeableAccessories(userId: string, friendshipId: string): Promise<TradeableAccessories> {
  const { friend } = await getAcceptedFriend(userId, friendshipId);
  const [mine, theirs] = await Promise.all([getOwnedAccessories(userId), getOwnedAccessories(friend.userId)]);
  const toItems = (list: typeof mine) => list.map((o) => ({ accessory: o.accessory, qty: o.qty })).sort(byRarityThenName);
  return { friend, theirs: toItems(theirs), mine: toItems(mine) };
}

/** Proposes to give `offeredId` to the friend in exchange for `requestedId`. */
export async function proposeTrade(userId: string, friendshipId: string, offeredId: string, requestedId: string): Promise<Trade> {
  const { friend } = await getAcceptedFriend(userId, friendshipId);
  if (!getAccessory(offeredId) || !getAccessory(requestedId)) throw new DomainError("unknown_accessory", "Accessoire inconnu.", 404);
  if (offeredId === requestedId) throw new DomainError("same_accessory", "Choisis deux accessoires différents.", 400);
  const [mine, theirs] = await Promise.all([ownedCounts(userId), ownedCounts(friend.userId)]);
  if (!mine.has(offeredId)) throw new DomainError("not_owned", "Tu ne possèdes pas cet accessoire.", 403);
  if (!theirs.has(requestedId)) throw new DomainError("not_owned", `${friend.username} ne possède pas cet accessoire.`, 409);

  const db = getDb();
  const pending = await db
    .select({ id: trades.id, offered: trades.offeredAccessoryId, requested: trades.requestedAccessoryId, receiverId: trades.receiverId })
    .from(trades)
    .where(and(eq(trades.proposerId, userId), eq(trades.status, "pending")));
  if (pending.some((t) => t.receiverId === friend.userId && t.offered === offeredId && t.requested === requestedId)) {
    throw new DomainError("already_proposed", "Tu as déjà proposé cet échange.", 409);
  }
  if (pending.length >= MAX_PENDING_OUTGOING) throw new DomainError("too_many_trades", "Trop de propositions en attente. Patiente un peu.", 429);

  const [trade] = await db
    .insert(trades)
    .values({ proposerId: userId, receiverId: friend.userId, offeredAccessoryId: offeredId, requestedAccessoryId: requestedId, status: "pending" })
    .returning();
  return trade;
}

const NO_LONGER_VALID = () => new DomainError("no_longer_valid", "Cet échange n'est plus possible : l'un des accessoires a changé de main.", 409);

/**
 * The receiver accepts: ownership of the two accessories is swapped. The
 * status flip is a conditional UPDATE so the swap runs at most once. Without
 * transactions (Neon HTTP) the two conditional decrements are the atomicity
 * point: both copies are taken first, a failed take refunds the other one and
 * cancels the trade, and only then are the copies handed over.
 */
export async function acceptTrade(userId: string, tradeId: string, now: Date = new Date()): Promise<Trade> {
  const db = getDb();
  const [trade] = await db.select().from(trades).where(and(eq(trades.id, tradeId), eq(trades.receiverId, userId), eq(trades.status, "pending"))).limit(1);
  if (!trade) throw new DomainError("not_found", "Proposition introuvable.", 404);

  const [proposerOwns, receiverOwns] = await Promise.all([ownedCounts(trade.proposerId), ownedCounts(trade.receiverId)]);
  const stillValid = proposerOwns.has(trade.offeredAccessoryId) && receiverOwns.has(trade.requestedAccessoryId);
  if (!stillValid) {
    await db.update(trades).set({ status: "cancelled", resolvedAt: now }).where(and(eq(trades.id, tradeId), eq(trades.status, "pending")));
    throw NO_LONGER_VALID();
  }

  const accepted = await db
    .update(trades)
    .set({ status: "accepted", resolvedAt: now })
    .where(and(eq(trades.id, tradeId), eq(trades.status, "pending")))
    .returning();
  if (!accepted[0]) throw new DomainError("not_found", "Proposition déjà traitée.", 409);
  const cancel = () => db.update(trades).set({ status: "cancelled", resolvedAt: now }).where(eq(trades.id, tradeId));

  // 1. The receiver's own copy (the actor's), then the proposer's.
  try {
    await takeAccessoryCopy(trade.receiverId, trade.requestedAccessoryId);
  } catch (error) {
    await cancel();
    throw error instanceof DomainError && error.code === "not_owned" ? NO_LONGER_VALID() : error;
  }
  try {
    await takeAccessoryCopy(trade.proposerId, trade.offeredAccessoryId);
  } catch (error) {
    await addAccessoryCopies(trade.receiverId, trade.requestedAccessoryId, 1, now);
    await cancel();
    throw error instanceof DomainError && error.code === "not_owned" ? NO_LONGER_VALID() : error;
  }
  // 2. Both copies are held: hand them over (adds never fail on ownership).
  await addAccessoryCopies(trade.receiverId, trade.offeredAccessoryId, 1, now);
  await addAccessoryCopies(trade.proposerId, trade.requestedAccessoryId, 1, now);
  return accepted[0];
}

/** The receiver declines, or the proposer withdraws. */
export async function withdrawTrade(userId: string, tradeId: string, now: Date = new Date()): Promise<Trade> {
  const db = getDb();
  const [trade] = await db.select().from(trades).where(and(eq(trades.id, tradeId), eq(trades.status, "pending"))).limit(1);
  if (!trade || (trade.proposerId !== userId && trade.receiverId !== userId)) throw new DomainError("not_found", "Proposition introuvable.", 404);
  const status = trade.receiverId === userId ? "declined" : "cancelled";
  const [updated] = await db.update(trades).set({ status, resolvedAt: now }).where(and(eq(trades.id, tradeId), eq(trades.status, "pending"))).returning();
  if (!updated) throw new DomainError("not_found", "Proposition déjà traitée.", 409);
  return updated;
}

export type TradeView = {
  id: string;
  direction: "incoming" | "outgoing";
  other: PublicProfile;
  /** What the proposer gives. */
  offered: Accessory;
  /** What the proposer asks for. */
  requested: Accessory;
  status: Trade["status"];
  createdAt: string;
  resolvedAt: string | null;
};

export type TradesOverview = { incoming: TradeView[]; outgoing: TradeView[]; recent: TradeView[] };

/** Pending trades on both sides plus the last week of resolved ones (for feedback). */
export async function listTrades(userId: string, now: Date = new Date()): Promise<TradesOverview> {
  const db = getDb();
  const since = new Date(now.getTime() - HISTORY_DAYS * 86_400_000);
  const rows = await db
    .select()
    .from(trades)
    .where(and(or(eq(trades.proposerId, userId), eq(trades.receiverId, userId)), or(eq(trades.status, "pending"), gt(trades.resolvedAt, since))))
    .orderBy(desc(trades.createdAt))
    .limit(60);
  const otherIds = [...new Set(rows.map((t) => (t.proposerId === userId ? t.receiverId : t.proposerId)))];
  const people = otherIds.length ? await db.select().from(profiles).where(inArray(profiles.userId, otherIds)) : [];
  const byId = new Map(people.map((p) => [p.userId, { userId: p.userId, username: p.username }]));
  const views = rows.flatMap((t): TradeView[] => {
    const other = byId.get(t.proposerId === userId ? t.receiverId : t.proposerId);
    const offered = getAccessory(t.offeredAccessoryId);
    const requested = getAccessory(t.requestedAccessoryId);
    if (!other || !offered || !requested) return [];
    return [
      {
        id: t.id,
        direction: t.proposerId === userId ? "outgoing" : "incoming",
        other,
        offered,
        requested,
        status: t.status,
        createdAt: t.createdAt.toISOString(),
        resolvedAt: t.resolvedAt?.toISOString() ?? null,
      },
    ];
  });
  return {
    incoming: views.filter((v) => v.status === "pending" && v.direction === "incoming"),
    outgoing: views.filter((v) => v.status === "pending" && v.direction === "outgoing"),
    recent: views.filter((v) => v.status !== "pending"),
  };
}

export async function countIncomingTrades(userId: string): Promise<number> {
  const [row] = await getDb()
    .select({ count: sql<number>`count(*)` })
    .from(trades)
    .where(and(eq(trades.receiverId, userId), eq(trades.status, "pending")));
  return Number(row?.count ?? 0);
}

export type GiftOutcome = { friend: PublicProfile; accessory: Accessory; copiesLeft: number };

/**
 * Gives one copy of an accessory to a friend, no return expected and no
 * acceptance needed. The friend is notified on their home screen (gifts row).
 */
export async function giftAccessory(userId: string, friendshipId: string, accessoryId: string, now: Date = new Date()): Promise<GiftOutcome> {
  const { friend } = await getAcceptedFriend(userId, friendshipId);
  const accessory = getAccessory(accessoryId);
  if (!accessory) throw new DomainError("unknown_accessory", "Accessoire inconnu.", 404);
  const copiesLeft = await takeAccessoryCopy(userId, accessoryId);
  await addAccessoryCopies(friend.userId, accessoryId, 1, now);
  await getDb().insert(gifts).values({ fromUserId: userId, toUserId: friend.userId, item: accessoryId, kind: "accessory", createdAt: now });
  return { friend, accessory, copiesLeft };
}
