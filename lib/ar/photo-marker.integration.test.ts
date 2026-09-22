import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@/lib/db";
import { friendships, profiles } from "@/lib/db/schema";
import type { ObjectStorage } from "@/lib/storage/r2";
import { createTestDatabase, insertTestUser, type TestDatabase } from "@/lib/test/pglite";
import { deletePhotoMarker, getPhotoMarker, photoMarkerImage, photoMarkerImageUrl, photoMarkerUrls, savePhotoMarker, setPhotoMarkerEnabled } from "./photo-marker";

const stored = new Map<string, Uint8Array>();
const storage: ObjectStorage = {
  async put(key, bytes) {
    stored.set(key, bytes);
  },
  async get(key) {
    const bytes = stored.get(key);
    return bytes ? { bytes, contentType: "image/jpeg" } : null;
  },
  async signedUrl(key) {
    return `https://signed.example/${key}`;
  },
  async remove(key) {
    stored.delete(key);
  },
  async removePrefix(prefix) {
    let n = 0;
    for (const key of [...stored.keys()]) {
      if (key.startsWith(prefix)) {
        stored.delete(key);
        n += 1;
      }
    }
    return n;
  },
};

let tdb: TestDatabase;
let alice: string;
let bob: string;
let carol: string;

beforeAll(async () => {
  tdb = await createTestDatabase();
  alice = await insertTestUser(tdb.db, "alice@example.com", "Alice");
  bob = await insertTestUser(tdb.db, "bob@example.com", "Bob");
  carol = await insertTestUser(tdb.db, "carol@example.com", "Carol");
  await getDb()
    .insert(profiles)
    .values([
      { userId: alice, username: "alice", friendCode: "ALICE1" },
      { userId: bob, username: "bob", friendCode: "BOB111" },
      { userId: carol, username: "carol", friendCode: "CAROL1" },
    ]);
  await getDb()
    .insert(friendships)
    .values([
      { requesterId: alice, addresseeId: bob, status: "accepted" },
      { requesterId: carol, addresseeId: alice, status: "pending" },
    ]);
});

afterAll(async () => {
  await tdb.close();
});

describe("photo markers", () => {
  it("saves a picture, serves it to the owner and accepted friends only, replaces, toggles and deletes it", async () => {
    expect(await getPhotoMarker(alice)).toEqual({ enabled: false, hasImage: false, updatedAt: null, imageUrl: null });
    await expect(setPhotoMarkerEnabled(alice, true)).rejects.toMatchObject({ code: "no_photo_marker" });
    await expect(savePhotoMarker(alice, { bytes: new Uint8Array(0), mimeType: "image/jpeg" }, storage)).rejects.toMatchObject({ code: "validation_error" });
    await expect(savePhotoMarker(alice, { bytes: Uint8Array.of(1), mimeType: "image/gif" }, storage)).rejects.toMatchObject({ code: "validation_error" });
    expect(stored.size).toBe(0);

    const now = new Date("2026-09-18T10:00:00Z");
    const saved = await savePhotoMarker(alice, { bytes: Uint8Array.of(1, 2, 3), mimeType: "image/jpeg" }, storage, now, "first");
    expect(saved).toEqual({ enabled: true, hasImage: true, updatedAt: now.toISOString(), imageUrl: photoMarkerImageUrl(alice, now) });
    expect(saved.imageUrl).toBe(`/api/ar/photo-marker/image?user=${encodeURIComponent(alice)}&v=${now.getTime()}`);
    expect([...stored.keys()]).toEqual([`markers/${alice}/first.jpg`]);
    expect((await photoMarkerImage(alice, alice, storage))?.bytes).toEqual(Uint8Array.of(1, 2, 3));
    expect((await photoMarkerImage(bob, alice, storage))?.bytes).toEqual(Uint8Array.of(1, 2, 3));
    await expect(photoMarkerImage(carol, alice, storage)).rejects.toMatchObject({ code: "not_found" });
    expect(await photoMarkerUrls([alice, bob, carol])).toEqual(new Map([[alice, saved.imageUrl]]));

    // A new picture replaces the previous object.
    const later = new Date("2026-09-18T11:00:00Z");
    const replaced = await savePhotoMarker(alice, { bytes: Uint8Array.of(4), mimeType: "image/png" }, storage, later, "second");
    expect([...stored.keys()]).toEqual([`markers/${alice}/second.jpg`]);
    expect(replaced.imageUrl).toBe(photoMarkerImageUrl(alice, later));

    // Switched off: friends stop getting it, the owner still sees the preview; the picture is kept.
    const off = await setPhotoMarkerEnabled(alice, false);
    expect(off).toMatchObject({ enabled: false, hasImage: true });
    expect(await photoMarkerUrls([alice])).toEqual(new Map());
    expect(await photoMarkerImage(bob, alice, storage)).toBeNull();
    expect((await photoMarkerImage(alice, alice, storage))?.bytes).toEqual(Uint8Array.of(4));
    expect((await setPhotoMarkerEnabled(alice, true)).enabled).toBe(true);
    expect((await photoMarkerImage(bob, alice, storage))?.bytes).toEqual(Uint8Array.of(4));

    // Deleted: nothing left in storage, option off.
    const gone = await deletePhotoMarker(alice, storage);
    expect(gone).toMatchObject({ enabled: false, hasImage: false, imageUrl: null });
    expect(stored.size).toBe(0);
    expect(await photoMarkerImage(alice, alice, storage)).toBeNull();
    expect(await photoMarkerImage(bob, alice, storage)).toBeNull();
  });

  it("refuses an unknown profile and leaves nothing behind", async () => {
    await expect(savePhotoMarker("nobody", { bytes: Uint8Array.of(9), mimeType: "image/jpeg" }, storage)).rejects.toMatchObject({ code: "not_found" });
    expect(stored.size).toBe(0);
    await expect(setPhotoMarkerEnabled("nobody", false)).rejects.toMatchObject({ code: "not_found" });
    await expect(deletePhotoMarker("nobody", storage)).rejects.toMatchObject({ code: "not_found" });
  });
});
