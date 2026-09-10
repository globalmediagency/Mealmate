import { and, desc, eq, gt, inArray, or, sql } from "drizzle-orm";
import { getAccessory, type Accessory } from "@/lib/accessories/catalog";
import { DomainError } from "@/lib/api/errors";
import { getDb } from "@/lib/db";
import { creatureOutfits, creatures, profiles, trades, userAccessories, type Trade } from "@/lib/db/schema";
import { getAcceptedFriend, type PublicProfile } from "@/lib/friends/service";

const MAX_PENDING_OUTGOING = 10;
const HISTORY_DAYS = 7;

async function ownedIds(userId: string): Promise<Set<string>> {
  const rows = await getDb().select({ id: userAccessories.accessoryId }).from(userAccessories).where(eq(userAccessories.userId, userId));
  return new Set(rows.map((r) => r.id));
}

export type TradeableAccessories = {
  friend: PublicProfile;
  /** Accessories the friend owns and I don't (what I can ask for). */
  theirs: Accessory[];
  /** Accessories I own and the friend doesn't (what I can offer). */
  mine: Accessory[];
};

/** What can be swapped between the user and a friend: each side only wants what it lacks. */
export async function tradeableAccessories(userId: string, friendshipId: string): Promise<TradeableAccessories> {
  const { friend } = await getAcceptedFriend(userId, friendshipId);
  const [mineIds, theirIds] = await Promise.all([ownedIds(userId), ownedIds(friend.userId)]);
  const toAccessories = (ids: Set<string>, exclude: Set<string>) =>
    [...ids]
      .filter((id) => !exclude.has(id))
      .map((id) => getAccessory(id))
      .filter((a): a is Accessory => a !== undefined)
      .sort((a, b) => a.name.localeCompare(b.name, "fr"));
  return { friend, theirs: toAccessories(theirIds, mineIds), mine: toAccessories(mineIds, theirIds) };
}

/** Proposes to give `offeredId` to the friend in exchange for `requestedId`. */
export async function proposeTrade(userId: string, friendshipId: string, offeredId: string, requestedId: string): Promise<Trade> {
  const { friend } = await getAcceptedFriend(userId, friendshipId);
  if (!getAccessory(offeredId) || !getAccessory(requestedId)) throw new DomainError("unknown_accessory", "Accessoire inconnu.", 404);
  if (offeredId === requestedId) throw new DomainError("same_accessory", "Choisis deux accessoires différents.", 400);
  const [mine, theirs] = await Promise.all([ownedIds(userId), ownedIds(friend.userId)]);
  if (!mine.has(offeredId)) throw new DomainError("not_owned", "Tu ne possèdes pas cet accessoire.", 403);
  if (!theirs.has(requestedId)) throw new DomainError("not_owned", `${friend.username} ne possède pas cet accessoire.`, 409);
  if (theirs.has(offeredId)) throw new DomainError("already_owned", `${friend.username} a déjà cet accessoire.`, 409);
  if (mine.has(requestedId)) throw new DomainError("already_owned", "Tu as déjà cet accessoire.", 409);

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

async function unequipEverywhere(ownerId: string, accessoryId: string): Promise<void> {
  const db = getDb();
  const owned = await db.select({ id: creatures.id }).from(creatures).where(eq(creatures.userId, ownerId));
  if (owned.length === 0) return;
  await db.delete(creatureOutfits).where(and(inArray(creatureOutfits.creatureId, owned.map((c) => c.id)), eq(creatureOutfits.accessoryId, accessoryId)));
}

/**
 * The receiver accepts: ownership of the two accessories is swapped. The
 * status flip is a conditional UPDATE so the swap runs at most once.
 */
export async function acceptTrade(userId: string, tradeId: string, now: Date = new Date()): Promise<Trade> {
  const db = getDb();
  const [trade] = await db.select().from(trades).where(and(eq(trades.id, tradeId), eq(trades.receiverId, userId), eq(trades.status, "pending"))).limit(1);
  if (!trade) throw new DomainError("not_found", "Proposition introuvable.", 404);

  const [proposerOwns, receiverOwns] = await Promise.all([ownedIds(trade.proposerId), ownedIds(trade.receiverId)]);
  const stillValid =
    proposerOwns.has(trade.offeredAccessoryId) &&
    receiverOwns.has(trade.requestedAccessoryId) &&
    !proposerOwns.has(trade.requestedAccessoryId) &&
    !receiverOwns.has(trade.offeredAccessoryId);
  if (!stillValid) {
    await db.update(trades).set({ status: "cancelled", resolvedAt: now }).where(and(eq(trades.id, tradeId), eq(trades.status, "pending")));
    throw new DomainError("no_longer_valid", "Cet échange n'est plus possible : l'un des accessoires a changé de main.", 409);
  }

  const accepted = await db
    .update(trades)
    .set({ status: "accepted", resolvedAt: now })
    .where(and(eq(trades.id, tradeId), eq(trades.status, "pending")))
    .returning();
  if (!accepted[0]) throw new DomainError("not_found", "Proposition déjà traitée.", 409);

  await unequipEverywhere(trade.proposerId, trade.offeredAccessoryId);
  await unequipEverywhere(trade.receiverId, trade.requestedAccessoryId);
  await db.delete(userAccessories).where(
    or(
      and(eq(userAccessories.userId, trade.proposerId), eq(userAccessories.accessoryId, trade.offeredAccessoryId)),
      and(eq(userAccessories.userId, trade.receiverId), eq(userAccessories.accessoryId, trade.requestedAccessoryId)),
    ),
  );
  await db
    .insert(userAccessories)
    .values([
      { userId: trade.proposerId, accessoryId: trade.requestedAccessoryId, obtainedAt: now },
      { userId: trade.receiverId, accessoryId: trade.offeredAccessoryId, obtainedAt: now },
    ])
    .onConflictDoNothing();
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
