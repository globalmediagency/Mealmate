import { z } from "zod";
import { fail, handleRouteError, ok } from "@/lib/api/respond";
import { getSession } from "@/lib/auth/session";
import { respondToBoarding, toBoardingView } from "@/lib/boarding/service";
import { getGameRules } from "@/lib/game/rules-service";

export const dynamic = "force-dynamic";

const idSchema = z.string().uuid();
const bodySchema = z.object({ accept: z.boolean() });

/** POST /api/boardings/:id/respond { accept } → the friend accepts (the stay starts now) or declines the proposal. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    if (!session) return fail("unauthorized", "Connecte-toi pour continuer.", 401);
    const { id } = await context.params;
    const body = bodySchema.parse(await request.json().catch(() => ({})));
    const now = new Date();
    const outcome = await respondToBoarding(session.user.id, idSchema.parse(id), body.accept, now, await getGameRules());
    return ok({ boarding: toBoardingView(outcome.boarding, now), accepted: outcome.accepted, owner: outcome.owner, creatureName: outcome.creature.name });
  } catch (error) {
    return handleRouteError(error);
  }
}
