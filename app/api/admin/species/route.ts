import { z } from "zod";
import { isAdminSession } from "@/lib/admin/auth";
import { fail, handleRouteError, ok } from "@/lib/api/respond";
import { optionalEnv } from "@/lib/env";
import { getStoredDisabledSpecies, setSpeciesEnabled } from "@/lib/game/species-service";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  id: z.string().min(1).max(80),
  enabled: z.boolean(),
});

/** GET /api/admin/species → the species switched off from the egg draws. */
export async function GET() {
  try {
    if (!(await isAdminSession())) return fail("unauthorized", "Connexion admin requise.", 401);
    const stored = await getStoredDisabledSpecies();
    return ok({ disabled: stored.disabled, updatedAt: stored.updatedAt?.toISOString() ?? null, updatedBy: stored.updatedBy });
  } catch (error) {
    return handleRouteError(error);
  }
}

/** PUT /api/admin/species { id, enabled } → switches one species in or out of the draws. */
export async function PUT(request: Request) {
  try {
    if (!(await isAdminSession())) return fail("unauthorized", "Connexion admin requise.", 401);
    const body = patchSchema.parse(await request.json().catch(() => ({})));
    const admin = optionalEnv("ADMIN_USERNAME") ?? "admin";
    const disabled = await setSpeciesEnabled(body.id, body.enabled, admin);
    return ok({ disabled });
  } catch (error) {
    return handleRouteError(error);
  }
}
