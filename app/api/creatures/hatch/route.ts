import { fail, handleRouteError, ok } from "@/lib/api/respond";
import { getSession } from "@/lib/auth/session";
import { hatchEgg } from "@/lib/creatures/service";
import { toCreatureView } from "@/lib/game/creature-view";
import { getGameRules } from "@/lib/game/rules-service";

export const dynamic = "force-dynamic";

/** POST /api/creatures/hatch → draws the species and brings the creature to life. */
export async function POST() {
  try {
    const session = await getSession();
    if (!session) return fail("unauthorized", "Connecte-toi pour continuer.", 401);
    const creature = await hatchEgg(session.user.id);
    return ok({ creature: toCreatureView(creature, new Date(), await getGameRules()) });
  } catch (error) {
    return handleRouteError(error);
  }
}
