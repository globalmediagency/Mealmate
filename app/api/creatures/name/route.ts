import { z } from "zod";
import { fail, handleRouteError, ok } from "@/lib/api/respond";
import { getSession } from "@/lib/auth/session";
import { creatureNameSchema, nameCreature } from "@/lib/creatures/service";
import { toCreatureView } from "@/lib/game/creature-view";

export const dynamic = "force-dynamic";

const nameSchema = z.object({ name: creatureNameSchema });

/** POST /api/creatures/name { name } → names the newborn creature. */
export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) return fail("unauthorized", "Connecte-toi pour continuer.", 401);
    const body = nameSchema.parse(await request.json().catch(() => ({})));
    const creature = await nameCreature(session.user.id, body.name);
    return ok({ creature: toCreatureView(creature) });
  } catch (error) {
    return handleRouteError(error);
  }
}
