import { z } from "zod";
import { fail, handleRouteError, ok } from "@/lib/api/respond";
import { getSession } from "@/lib/auth/session";
import { startBoarding, toBoardingView } from "@/lib/boarding/service";
import { BOARDING } from "@/lib/game/config";

export const dynamic = "force-dynamic";

const idSchema = z.string().uuid();
const bodySchema = z.object({ days: z.coerce.number().int().min(1).max(BOARDING.maxDays) });

/** POST /api/friends/:id/board { days } → entrusts the user's creature to this friend for `days` days. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    if (!session) return fail("unauthorized", "Connecte-toi pour continuer.", 401);
    const { id } = await context.params;
    const body = bodySchema.parse(await request.json().catch(() => ({})));
    const outcome = await startBoarding(session.user.id, idSchema.parse(id), body.days);
    return ok({ boarding: toBoardingView(outcome.boarding), friend: outcome.friend, creatureName: outcome.creature.name });
  } catch (error) {
    return handleRouteError(error);
  }
}
