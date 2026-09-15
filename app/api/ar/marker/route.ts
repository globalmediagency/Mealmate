import type { NextRequest } from "next/server";
import { z } from "zod";
import { fail, handleRouteError } from "@/lib/api/respond";
import { markerPdf } from "@/lib/ar/pdf";
import { ensureCreatureMarker, ownCreatureById } from "@/lib/ar/service";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const querySchema = z.object({ creature: z.string().uuid() });

/** GET /api/ar/marker?creature=<id> → printable A4 PDF with the marker of one of the viewer's own creatures. */
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return fail("unauthorized", "Connecte-toi pour continuer.", 401);
    const parsed = querySchema.safeParse({ creature: request.nextUrl.searchParams.get("creature") ?? "" });
    if (!parsed.success) return fail("validation_error", "Créature manquante.", 400);
    const creature = await ownCreatureById(session.user.id, parsed.data.creature);
    if (!creature || creature.status !== "alive" || !creature.name) return fail("not_found", "Cette créature n'est pas prête pour un marqueur.", 404);
    const id = await ensureCreatureMarker(creature);
    const bytes = await markerPdf({ id, name: creature.name });
    const fileName = creature.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9-]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "creature";
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="mealmate-marqueur-${fileName}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
