import { z } from "zod";
import { deletePlayerAccount } from "@/lib/admin/accounts";
import { isAdminSession } from "@/lib/admin/auth";
import { fail, handleRouteError, ok } from "@/lib/api/respond";
import { r2Storage } from "@/lib/storage/r2";
import { stravaApi } from "@/lib/strava/api";

export const dynamic = "force-dynamic";

const idSchema = z.string().min(1).max(64);

/**
 * DELETE /api/admin/players/:id → deletes the player's account (photos and
 * Strava grant first, then everything in cascade), for the admin only.
 */
export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    if (!(await isAdminSession())) return fail("unauthorized", "Connexion admin requise.", 401);
    const { id } = await context.params;
    const report = await deletePlayerAccount(idSchema.parse(id), { storage: r2Storage, stravaApi });
    if (!report.deleted) return fail("not_found", "Joueur inconnu.", 404);
    return ok(report, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return handleRouteError(error);
  }
}
