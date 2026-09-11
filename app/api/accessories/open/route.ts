import { z } from "zod";
import { openChest } from "@/lib/accessories/service";
import { fail, handleRouteError, ok } from "@/lib/api/respond";
import { getSession } from "@/lib/auth/session";
import { getHeldCreature } from "@/lib/boarding/service";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ creatureId: z.string().uuid().optional() });

/** POST /api/accessories/open { creatureId? } → opens one earned chest of the user's creature (or of one boarded with them: the host keeps the accessory). */
export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) return fail("unauthorized", "Connecte-toi pour continuer.", 401);
    const body = bodySchema.parse(await request.json().catch(() => ({})));
    const held = await getHeldCreature(session.user.id, body.creatureId);
    const creature = held.creature;
    if (creature.status !== "alive") return fail("no_creature", "Il faut une créature vivante pour ouvrir un coffre.", 409);
    const reward = await openChest(session.user.id, creature, undefined, { boarded: held.boarding !== null });
    return ok({ ...reward });
  } catch (error) {
    return handleRouteError(error);
  }
}
