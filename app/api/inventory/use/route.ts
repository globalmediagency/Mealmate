import { z } from "zod";
import { fail, handleRouteError, ok } from "@/lib/api/respond";
import { getSession } from "@/lib/auth/session";
import { getHeldCreature } from "@/lib/boarding/service";
import { toCreatureView } from "@/lib/game/creature-view";
import { getGameRules } from "@/lib/game/rules-service";
import { shopItemSchema } from "@/lib/shop/schemas";
import { consumeMedicine } from "@/lib/shop/service";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ item: shopItemSchema, creatureId: z.string().uuid().optional() });

/** POST /api/inventory/use { item, creatureId? } → applies one dose to the user's creature (or to one boarded with them). */
export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) return fail("unauthorized", "Connecte-toi pour continuer.", 401);
    const body = bodySchema.parse(await request.json().catch(() => ({})));
    const now = new Date();
    const rules = await getGameRules();
    const held = await getHeldCreature(session.user.id, body.creatureId, now, rules);
    const creature = held.creature;
    if (creature.status !== "alive") return fail("no_creature", "Il faut une créature vivante pour utiliser un soin.", 409);
    const outcome = await consumeMedicine(session.user.id, creature, body.item, now, { boarded: held.boarding !== null });
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
