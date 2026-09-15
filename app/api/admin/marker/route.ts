import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { isAdminSession } from "@/lib/admin/auth";
import { fail, handleRouteError } from "@/lib/api/respond";
import { markerSvg } from "@/lib/ar/marker";
import { markerPdf } from "@/lib/ar/pdf";
import { ensureCreatureMarker } from "@/lib/ar/service";
import { getDb } from "@/lib/db";
import { creatures } from "@/lib/db/schema";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const querySchema = z.object({ creature: z.string().uuid(), format: z.enum(["svg", "pdf"]).default("svg") });

/**
 * GET /api/admin/marker?creature=<id>&format=svg|pdf → the printed marker of
 * any player's creature (assigned on first request), for the admin only.
 */
export async function GET(request: NextRequest) {
  try {
    if (!(await isAdminSession())) return fail("unauthorized", "Connexion admin requise.", 401);
    const parsed = querySchema.safeParse({ creature: request.nextUrl.searchParams.get("creature") ?? "", format: request.nextUrl.searchParams.get("format") ?? "svg" });
    if (!parsed.success) return fail("validation_error", "Créature manquante.", 400);
    const [creature] = await getDb().select().from(creatures).where(eq(creatures.id, parsed.data.creature)).limit(1);
    if (!creature) return fail("not_found", "Créature inconnue.", 404);
    if (creature.status === "egg" || !creature.name) return fail("not_ready", "Cet œuf n'a pas encore éclos : pas de marqueur.", 409);
    const id = await ensureCreatureMarker(creature);
    if (parsed.data.format === "pdf") {
      const bytes = await markerPdf({ id, name: creature.name });
      return new Response(new Uint8Array(bytes), {
        headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="mealmate-marqueur-${id}.pdf"`, "Cache-Control": "private, no-store" },
      });
    }
    return new Response(markerSvg(id), { headers: { "Content-Type": "image/svg+xml; charset=utf-8", "Cache-Control": "private, no-store" } });
  } catch (error) {
    return handleRouteError(error);
  }
}
