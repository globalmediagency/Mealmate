import { and, desc, eq, inArray, or } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  account,
  boardings,
  creatureOutfits,
  creatures,
  friendships,
  gifts,
  inventory,
  meals,
  playSessions,
  profiles,
  purchases,
  stepEntries,
  trades,
  user,
  userAccessories,
} from "@/lib/db/schema";
import { isConfigError } from "@/lib/env";
import type { ObjectStorage } from "@/lib/storage/r2";
import type { StravaApi } from "@/lib/strava/api";
import { disconnectStrava, getStravaStatus } from "@/lib/strava/service";

/** True when the user signed up with email + password (Google-only users have no password). */
export async function hasPasswordAccount(userId: string): Promise<boolean> {
  const rows = await getDb().select({ providerId: account.providerId }).from(account).where(eq(account.userId, userId));
  return rows.some((row) => row.providerId === "credential");
}

/** Copies an object without the given keys (internal ids and storage keys never leave the server). */
function omit<T extends object, K extends keyof T>(row: T, keys: readonly K[]): Omit<T, K> {
  const copy: Partial<T> = { ...row };
  for (const key of keys) delete copy[key];
  return copy as Omit<T, K>;
}

/** Everything MealMate holds about a user, as plain JSON (photos are listed by date only, never by key). */
export async function exportAccount(userId: string, now: Date = new Date()) {
  const db = getDb();
  const [users, profileRows, creatureRows, mealRows, stepRows, playRows, accessoryRows, friendshipRows, purchaseRows, inventoryRows, giftRows, tradeRows, boardingRows, strava] =
    await Promise.all([
      db.select({ email: user.email, name: user.name, createdAt: user.createdAt }).from(user).where(eq(user.id, userId)),
      db.select({ username: profiles.username, friendCode: profiles.friendCode, createdAt: profiles.createdAt }).from(profiles).where(eq(profiles.userId, userId)),
      db.select().from(creatures).where(eq(creatures.userId, userId)).orderBy(desc(creatures.createdAt)),
      db.select().from(meals).where(eq(meals.userId, userId)).orderBy(desc(meals.createdAt)),
      db.select().from(stepEntries).where(eq(stepEntries.userId, userId)).orderBy(desc(stepEntries.date)),
      db.select().from(playSessions).where(eq(playSessions.userId, userId)).orderBy(desc(playSessions.createdAt)),
      db.select().from(userAccessories).where(eq(userAccessories.userId, userId)),
      db.select().from(friendships).where(or(eq(friendships.requesterId, userId), eq(friendships.addresseeId, userId))),
      db.select().from(purchases).where(eq(purchases.userId, userId)).orderBy(desc(purchases.createdAt)),
      db.select().from(inventory).where(eq(inventory.userId, userId)),
      db.select().from(gifts).where(or(eq(gifts.fromUserId, userId), eq(gifts.toUserId, userId))),
      db.select().from(trades).where(or(eq(trades.proposerId, userId), eq(trades.receiverId, userId))),
      db.select().from(boardings).where(or(eq(boardings.ownerId, userId), eq(boardings.hostId, userId))),
      getStravaStatus(userId, now),
    ]);

  const creatureIds = creatureRows.map((c) => c.id);
  const outfitRows = creatureIds.length ? await db.select().from(creatureOutfits).where(inArray(creatureOutfits.creatureId, creatureIds)) : [];

  // Other people appear by username only.
  const otherIds = new Set<string>();
  for (const f of friendshipRows) otherIds.add(f.requesterId === userId ? f.addresseeId : f.requesterId);
  for (const g of giftRows) otherIds.add(g.fromUserId === userId ? g.toUserId : g.fromUserId);
  for (const t of tradeRows) otherIds.add(t.proposerId === userId ? t.receiverId : t.proposerId);
  for (const b of boardingRows) otherIds.add(b.ownerId === userId ? b.hostId : b.ownerId);
  const others = otherIds.size ? await db.select({ userId: profiles.userId, username: profiles.username }).from(profiles).where(inArray(profiles.userId, [...otherIds])) : [];
  const nameOf = new Map(others.map((p) => [p.userId, p.username]));
  const other = (id: string) => nameOf.get(id) ?? "utilisateur supprimé";

  return {
    exportedAt: now.toISOString(),
    application: "MealMate",
    user: users[0] ?? null,
    profile: profileRows[0] ?? null,
    creatures: creatureRows.map((c) => ({ ...omit(c, ["userId"]), outfit: outfitRows.filter((o) => o.creatureId === c.id).map(({ slot, accessoryId }) => ({ slot, accessoryId })) })),
    meals: mealRows.map((m) => omit(m, ["userId", "imageKey", "imageHash"])),
    steps: stepRows.map((row) => omit(row, ["userId"])),
    playSessions: playRows.map((row) => omit(row, ["userId"])),
    accessories: accessoryRows.map(({ accessoryId, obtainedAt, qty }) => ({ accessoryId, obtainedAt, qty })),
    friends: friendshipRows.map((f) => ({ username: other(f.requesterId === userId ? f.addresseeId : f.requesterId), status: f.status, direction: f.requesterId === userId ? "sent" : "received", since: f.createdAt })),
    purchases: purchaseRows.map((row) => omit(row, ["userId"])),
    inventory: inventoryRows.map(({ item, qty }) => ({ item, qty })),
    gifts: giftRows.map((g) => ({ direction: g.fromUserId === userId ? "sent" : "received", with: other(g.fromUserId === userId ? g.toUserId : g.fromUserId), kind: g.kind, item: g.item, createdAt: g.createdAt })),
    trades: tradeRows.map((t) => ({ direction: t.proposerId === userId ? "proposed" : "received", with: other(t.proposerId === userId ? t.receiverId : t.proposerId), offered: t.offeredAccessoryId, requested: t.requestedAccessoryId, status: t.status, createdAt: t.createdAt, resolvedAt: t.resolvedAt })),
    boardings: boardingRows.map((b) => ({ role: b.ownerId === userId ? "owner" : "host", with: other(b.ownerId === userId ? b.hostId : b.ownerId), creatureId: b.creatureId, startedAt: b.startedAt, endsAt: b.endsAt, endedAt: b.endedAt, endReason: b.endReason })),
    strava: { connected: strava.connected, athleteName: strava.athleteName, lastSyncAt: strava.lastSyncAt },
  };
}

export type PurgeDeps = { storage: ObjectStorage; stravaApi: StravaApi };
export type PurgeReport = { photosRemoved: number; stravaRevoked: boolean };

/**
 * Removes what the database cascade cannot reach: meal photos in R2 and the
 * Strava authorisation. Called before the user row is deleted. A storage
 * that is not configured is skipped (nothing could have been uploaded).
 */
export async function purgeExternalData(userId: string, deps: PurgeDeps): Promise<PurgeReport> {
  let photosRemoved = 0;
  try {
    photosRemoved = await deps.storage.removePrefix(`meals/${userId}/`);
  } catch (error) {
    if (!isConfigError(error)) throw error;
  }
  const strava = await getStravaStatus(userId);
  if (strava.connected) await disconnectStrava(userId, deps.stravaApi);
  return { photosRemoved, stravaRevoked: strava.connected };
}

/** Deletes the user row; every MealMate table cascades from it. Used by tests and the auth hook fallback. */
export async function deleteUserRow(userId: string): Promise<boolean> {
  const rows = await getDb().delete(user).where(eq(user.id, userId)).returning({ id: user.id });
  return rows.length > 0;
}

/** Full deletion in one call (external data first, then the row). */
export async function deleteAccount(userId: string, deps: PurgeDeps): Promise<PurgeReport & { deleted: boolean }> {
  const report = await purgeExternalData(userId, deps);
  const deleted = await deleteUserRow(userId);
  return { ...report, deleted };
}

/** Rows that must disappear with the user (used by the integration test as a checklist). */
export async function countUserFootprint(userId: string): Promise<Record<string, number>> {
  const db = getDb();
  const count = async (rows: Promise<unknown[]>) => (await rows).length;
  return {
    profiles: await count(db.select().from(profiles).where(eq(profiles.userId, userId))),
    creatures: await count(db.select().from(creatures).where(eq(creatures.userId, userId))),
    meals: await count(db.select().from(meals).where(eq(meals.userId, userId))),
    steps: await count(db.select().from(stepEntries).where(eq(stepEntries.userId, userId))),
    accessories: await count(db.select().from(userAccessories).where(eq(userAccessories.userId, userId))),
    friendships: await count(db.select().from(friendships).where(or(eq(friendships.requesterId, userId), eq(friendships.addresseeId, userId)))),
    purchases: await count(db.select().from(purchases).where(eq(purchases.userId, userId))),
    inventory: await count(db.select().from(inventory).where(eq(inventory.userId, userId))),
    gifts: await count(db.select().from(gifts).where(or(eq(gifts.fromUserId, userId), eq(gifts.toUserId, userId)))),
    trades: await count(db.select().from(trades).where(or(eq(trades.proposerId, userId), eq(trades.receiverId, userId)))),
    boardings: await count(db.select().from(boardings).where(or(eq(boardings.ownerId, userId), eq(boardings.hostId, userId)))),
    accounts: await count(db.select().from(account).where(and(eq(account.userId, userId)))),
  };
}
