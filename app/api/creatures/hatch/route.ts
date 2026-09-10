import { fail, handleRouteError, ok } from "@/lib/api/respond";
import { getSession } from "@/lib/auth/session";
import { hatchEgg } from "@/lib/creatures/service";
import { toCreatureView } from "@/lib/game/creature-view";

export const dynamic = "force-dynamic";

/** POST /api/creatures/hatch → draws the species and brings the creature to life. */
export async function POST() {
  try {
    const session = await getSession();
    if (!session) return fail("unauthorized", "Connecte-toi pour continuer.", 401);
    const creature = await hatchEgg(session.user.id);
    return ok({ creature: toCreatureView(creature) });
  } catch (error) {
    return handleRouteError(error);
  }
}
