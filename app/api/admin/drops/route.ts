import { z } from "zod";
import { isAdminSession } from "@/lib/admin/auth";
import { fail, handleRouteError, ok } from "@/lib/api/respond";
import { optionalEnv } from "@/lib/env";
import { TIERS } from "@/lib/game/config";
import { accessoryWeights, speciesWeights, weightEntrySchema } from "@/lib/game/drops";
import { getDropWeights, getStoredDropWeights, saveDropWeights } from "@/lib/game/drops-service";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  kind: z.enum(["species", "accessories"]),
  /** id → weight in % (up to 3 decimals), or null to go back to the rarity default. */
  weights: z.record(z.string().min(1).max(80), weightEntrySchema.nullable()),
});

const view = (rows: ReturnType<typeof speciesWeights> | ReturnType<typeof accessoryWeights>) =>
  rows.map((r) => ({ id: r.item.id, name: r.item.name, rarity: r.item.rarity, weight: r.weight, defaultWeight: r.defaultWeight, overridden: r.overridden, percent: r.percent, oneIn: r.oneIn }));

/** GET /api/admin/drops → effective weights per tier and for accessories. */
export async function GET() {
  try {
    if (!(await isAdminSession())) return fail("unauthorized", "Connexion admin requise.", 401);
    const [weights, stored] = await Promise.all([getDropWeights(), getStoredDropWeights()]);
    return ok({
      species: Object.fromEntries(TIERS.map((tier) => [tier, view(speciesWeights(tier, weights.species))])),
      accessories: view(accessoryWeights(weights.accessories)),
      updatedAt: stored.updatedAt?.toISOString() ?? null,
      updatedBy: stored.updatedBy,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

/** PUT /api/admin/drops { kind, weights } → merges overrides (null = default). */
export async function PUT(request: Request) {
  try {
    if (!(await isAdminSession())) return fail("unauthorized", "Connexion admin requise.", 401);
    const body = patchSchema.parse(await request.json().catch(() => ({})));
    const admin = optionalEnv("ADMIN_USERNAME") ?? "admin";
    const weights = await saveDropWeights(body, admin);
    return ok({ weights });
  } catch (error) {
    return handleRouteError(error);
  }
}
