import type { NextRequest } from "next/server";
import { z } from "zod";
import { fail, handleRouteError, ok } from "@/lib/api/respond";
import { PHOTO_MARKER } from "@/lib/ar/config";
import { deletePhotoMarker, getPhotoMarker, savePhotoMarker, setPhotoMarkerEnabled } from "@/lib/ar/photo-marker";
import { getSession } from "@/lib/auth/session";
import { r2Storage } from "@/lib/storage/r2";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const patchSchema = z.object({ enabled: z.boolean() });

/** GET /api/ar/photo-marker → the viewer's photo marker status (spec § 3.19). */
export async function GET() {
  try {
    const session = await getSession();
    if (!session) return fail("unauthorized", "Connecte-toi pour continuer.", 401);
    return ok(await getPhotoMarker(session.user.id));
  } catch (error) {
    return handleRouteError(error);
  }
}

/** PUT /api/ar/photo-marker (multipart `image`) → stores a new picture and switches the option on. */
export async function PUT(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return fail("unauthorized", "Connecte-toi pour continuer.", 401);
    const form = await request.formData().catch(() => null);
    const file = form?.get("image");
    if (!(file instanceof File)) return fail("validation_error", "Aucune image reçue.", 400);
    if (file.size === 0) return fail("validation_error", "Image vide.", 400);
    if (file.size > PHOTO_MARKER.maxBytes) return fail("validation_error", "Image trop lourde.", 413);
    const bytes = new Uint8Array(await file.arrayBuffer());
    return ok(await savePhotoMarker(session.user.id, { bytes, mimeType: file.type }, r2Storage));
  } catch (error) {
    return handleRouteError(error);
  }
}

/** PATCH /api/ar/photo-marker { enabled } → switches the picture on or off. */
export async function PATCH(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return fail("unauthorized", "Connecte-toi pour continuer.", 401);
    const body = patchSchema.parse(await request.json());
    return ok(await setPhotoMarkerEnabled(session.user.id, body.enabled));
  } catch (error) {
    return handleRouteError(error);
  }
}

/** DELETE /api/ar/photo-marker → removes the picture and switches the option off. */
export async function DELETE() {
  try {
    const session = await getSession();
    if (!session) return fail("unauthorized", "Connecte-toi pour continuer.", 401);
    return ok(await deletePhotoMarker(session.user.id, r2Storage));
  } catch (error) {
    return handleRouteError(error);
  }
}
