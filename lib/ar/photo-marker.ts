import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { DomainError } from "@/lib/api/errors";
import { getDb } from "@/lib/db";
import { profiles } from "@/lib/db/schema";
import { acceptedFriendIds } from "@/lib/friends/service";
import { photoMarkerKey, type ObjectStorage } from "@/lib/storage/r2";
import { PHOTO_MARKER } from "./config";

/**
 * Photo markers (spec § 3.19): instead of the printed AprilTag, a player may
 * photograph anything (a pen drawing on a sheet, a hand) that the camera
 * will then recognise as their creature's marker. One picture per user,
 * stored privately in R2 under `markers/<userId>/`, switched on or off,
 * replaced or removed at will. The picture is only ever served to its
 * owner and their accepted friends (the ones whose phones must recognise
 * it), through the same-origin image route.
 */
export type PhotoMarkerStatus = {
  /** In use: phones (the owner's and their friends') look for the picture. */
  enabled: boolean;
  hasImage: boolean;
  updatedAt: string | null;
  /** Same-origin URL of the picture (owner and accepted friends only); null without a picture. */
  imageUrl: string | null;
};

export type PhotoMarkerImage = { bytes: Uint8Array; mimeType: string };

const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

/** URL a phone loads the picture from, versioned so a replaced picture is never served from cache. */
export function photoMarkerImageUrl(userId: string, updatedAt: Date | string | null): string {
  const version = updatedAt ? new Date(updatedAt).getTime() : 0;
  return `/api/ar/photo-marker/image?user=${encodeURIComponent(userId)}&v=${version}`;
}

type Row = { key: string | null; enabled: boolean; updatedAt: Date | null };

async function loadRow(userId: string): Promise<Row | undefined> {
  const rows = await getDb()
    .select({ key: profiles.photoMarkerKey, enabled: profiles.photoMarkerEnabled, updatedAt: profiles.photoMarkerUpdatedAt })
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .limit(1);
  return rows[0];
}

function toStatus(userId: string, row: Row | undefined): PhotoMarkerStatus {
  const hasImage = Boolean(row?.key);
  return {
    enabled: hasImage && Boolean(row?.enabled),
    hasImage,
    updatedAt: row?.updatedAt?.toISOString() ?? null,
    imageUrl: hasImage ? photoMarkerImageUrl(userId, row?.updatedAt ?? null) : null,
  };
}

export async function getPhotoMarker(userId: string): Promise<PhotoMarkerStatus> {
  return toStatus(userId, await loadRow(userId));
}

/** Stores a new picture (switched on right away) and forgets the previous one. */
export async function savePhotoMarker(userId: string, image: PhotoMarkerImage, storage: ObjectStorage, now: Date = new Date(), id: string = crypto.randomUUID()): Promise<PhotoMarkerStatus> {
  if (!ACCEPTED_TYPES.has(image.mimeType)) throw new DomainError("validation_error", "Format d'image non pris en charge (JPEG, PNG ou WebP).", 400);
  if (image.bytes.length === 0) throw new DomainError("validation_error", "Image vide.", 400);
  if (image.bytes.length > PHOTO_MARKER.maxBytes) throw new DomainError("validation_error", "Image trop lourde.", 413);
  const before = await loadRow(userId);
  if (!before) throw new DomainError("not_found", "Profil introuvable.", 404);
  const key = photoMarkerKey(userId, id);
  await storage.put(key, image.bytes, image.mimeType);
  const rows = await getDb()
    .update(profiles)
    .set({ photoMarkerKey: key, photoMarkerEnabled: true, photoMarkerUpdatedAt: now })
    .where(eq(profiles.userId, userId))
    .returning({ key: profiles.photoMarkerKey, enabled: profiles.photoMarkerEnabled, updatedAt: profiles.photoMarkerUpdatedAt });
  if (rows.length === 0) {
    await storage.remove(key).catch(() => undefined);
    throw new DomainError("not_found", "Profil introuvable.", 404);
  }
  if (before.key && before.key !== key) await storage.remove(before.key).catch((error: unknown) => console.warn("[photo-marker] previous picture not removed", error));
  return toStatus(userId, rows[0]);
}

/** Switches the picture on or off without forgetting it; switching on needs a picture. */
export async function setPhotoMarkerEnabled(userId: string, enabled: boolean): Promise<PhotoMarkerStatus> {
  const row = await loadRow(userId);
  if (!row) throw new DomainError("not_found", "Profil introuvable.", 404);
  if (enabled && !row.key) throw new DomainError("no_photo_marker", "Prends d'abord une photo de ton marqueur.", 409);
  const rows = await getDb()
    .update(profiles)
    .set({ photoMarkerEnabled: enabled })
    .where(eq(profiles.userId, userId))
    .returning({ key: profiles.photoMarkerKey, enabled: profiles.photoMarkerEnabled, updatedAt: profiles.photoMarkerUpdatedAt });
  return toStatus(userId, rows[0]);
}

/** Removes the picture (storage first, best effort) and switches the option off. */
export async function deletePhotoMarker(userId: string, storage: ObjectStorage, now: Date = new Date()): Promise<PhotoMarkerStatus> {
  const row = await loadRow(userId);
  if (!row) throw new DomainError("not_found", "Profil introuvable.", 404);
  if (row.key) await storage.remove(row.key).catch((error: unknown) => console.warn("[photo-marker] picture not removed", error));
  const rows = await getDb()
    .update(profiles)
    .set({ photoMarkerKey: null, photoMarkerEnabled: false, photoMarkerUpdatedAt: now })
    .where(eq(profiles.userId, userId))
    .returning({ key: profiles.photoMarkerKey, enabled: profiles.photoMarkerEnabled, updatedAt: profiles.photoMarkerUpdatedAt });
  return toStatus(userId, rows[0]);
}

/**
 * The picture of `ownerId` for `viewerId`'s phone: the owner always sees
 * their own (even switched off, for the preview); an accepted friend only
 * while it is in use; anyone else gets `not_found`. Null without a picture.
 */
export async function photoMarkerImage(viewerId: string, ownerId: string, storage: ObjectStorage): Promise<{ bytes: Uint8Array; contentType: string | null } | null> {
  const mine = viewerId === ownerId;
  if (!mine && !(await acceptedFriendIds(viewerId)).includes(ownerId)) throw new DomainError("not_found", "Pas de marqueur photo.", 404);
  const row = await loadRow(ownerId);
  if (!row?.key || (!mine && !row.enabled)) return null;
  return storage.get(row.key);
}

/** Image URLs of the users among `userIds` whose photo marker is in use (for the AR targets and the match players). */
export async function photoMarkerUrls(userIds: string[]): Promise<Map<string, string>> {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return new Map();
  const rows = await getDb()
    .select({ userId: profiles.userId, updatedAt: profiles.photoMarkerUpdatedAt })
    .from(profiles)
    .where(and(inArray(profiles.userId, ids), eq(profiles.photoMarkerEnabled, true), isNotNull(profiles.photoMarkerKey)));
  return new Map(rows.map((r) => [r.userId, photoMarkerImageUrl(r.userId, r.updatedAt)]));
}
