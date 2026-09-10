import { z } from "zod";
import { fail, handleRouteError, ok } from "@/lib/api/respond";
import { getSession } from "@/lib/auth/session";
import { getActiveCreatureTicked } from "@/lib/creatures/service";
import { toCreatureView } from "@/lib/game/creature-view";
import { getGameRules } from "@/lib/game/rules-service";
import { shopItemSchema } from "@/lib/shop/schemas";
import { consumeMedicine } from "@/lib/shop/service";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ item: shopItemSchema });

/** POST /api/inventory/use { item } → applies one dose to the user's creature. */
export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) return fail("unauthorized", "Connecte-toi pour continuer.", 401);
    const body = bodySchema.parse(await request.json().catch(() => ({})));
    const now = new Date();
    const rules = await getGameRules();
    const creature = await getActiveCreatureTicked(session.user.id, now, rules);
    if (!creature || creature.status !== "alive") return fail("no_creature", "Il faut une créature vivante pour utiliser un soin.", 409);
    const outcome = await consumeMedicine(session.user.id, creature, body.item, now);
    return ok({
      healthDelta: outcome.healthDelta,
      cured: outcome.cured,
      protectedUntil: outcome.protectedUntil?.toISOString() ?? null,
      inventory: outcome.inventory,
      creature: toCreatureView(outcome.creature, now, rules),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
