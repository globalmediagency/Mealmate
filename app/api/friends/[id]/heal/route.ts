import { z } from "zod";
import { fail, handleRouteError, ok } from "@/lib/api/respond";
import { getSession } from "@/lib/auth/session";
import { shopItemSchema } from "@/lib/shop/schemas";
import { healFriendCreature } from "@/lib/shop/service";

export const dynamic = "force-dynamic";

const idSchema = z.string().uuid();
const bodySchema = z.object({ item: shopItemSchema });

/** POST /api/friends/:id/heal { item } → sends one dose to the friend's creature. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    if (!session) return fail("unauthorized", "Connecte-toi pour continuer.", 401);
    const { id } = await context.params;
    const body = bodySchema.parse(await request.json().catch(() => ({})));
    const outcome = await healFriendCreature(session.user.id, idSchema.parse(id), body.item);
    return ok({
      friend: outcome.friend,
      creatureName: outcome.creatureName,
      health: Math.round(outcome.creature.health),
      healthDelta: outcome.healthDelta,
      cured: outcome.cured,
      protectedUntil: outcome.protectedUntil?.toISOString() ?? null,
      inventory: outcome.inventory,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
