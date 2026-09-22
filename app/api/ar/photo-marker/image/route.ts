import type { NextRequest } from "next/server";
import { z } from "zod";
import { fail, handleRouteError } from "@/lib/api/respond";
import { PHOTO_MARKER } from "@/lib/ar/config";
import { photoMarkerImage } from "@/lib/ar/photo-marker";
import { getSession } from "@/lib/auth/session";
import { r2Storage } from "@/lib/storage/r2";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const querySchema = z.object({ user: z.string().min(1).max(128) });

/**
 * GET /api/ar/photo-marker/image?user=<id> → the picture a phone must
 * recognise: one's own (always), or an accepted friend's while it is in use
 * (spec § 3.19). Served same-origin so the camera can read its pixels.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return fail("unauthorized", "Connecte-toi pour continuer.", 401);
    const parsed = querySchema.safeParse({ user: request.nextUrl.searchParams.get("user") ?? "" });
    if (!parsed.success) return fail("validation_error", "Joueur manquant.", 400);
    const image = await photoMarkerImage(session.user.id, parsed.data.user, r2Storage);
    if (!image) return fail("not_found", "Pas de marqueur photo.", 404);
    return new Response(new Uint8Array(image.bytes), {
      headers: {
        "Content-Type": image.contentType ?? "image/jpeg",
        "Cache-Control": `private, max-age=${PHOTO_MARKER.cacheSeconds}`,
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
