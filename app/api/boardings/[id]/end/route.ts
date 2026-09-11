import { z } from "zod";
import { fail, handleRouteError, ok } from "@/lib/api/respond";
import { getSession } from "@/lib/auth/session";
import { endBoarding, toBoardingView } from "@/lib/boarding/service";
import { toCreatureView } from "@/lib/game/creature-view";
import { getGameRules } from "@/lib/game/rules-service";

export const dynamic = "force-dynamic";

const idSchema = z.string().uuid();

/** POST /api/boardings/:id/end → the owner takes the creature back, or the host sends it home. */
export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    if (!session) return fail("unauthorized", "Connecte-toi pour continuer.", 401);
    const { id } = await context.params;
    const now = new Date();
    const rules = await getGameRules();
    const outcome = await endBoarding(session.user.id, idSchema.parse(id), now, rules);
    return ok({
      boarding: toBoardingView(outcome.boarding, now),
      endReason: outcome.boarding.endReason,
      role: outcome.role,
      other: outcome.other,
      creature: toCreatureView(outcome.creature, now, rules),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
