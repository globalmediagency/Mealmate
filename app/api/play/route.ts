import { z } from "zod";
import { fail, handleRouteError, ok } from "@/lib/api/respond";
import { getSession } from "@/lib/auth/session";
import { getActiveCreatureTicked } from "@/lib/creatures/service";
import { PLAY } from "@/lib/game/config";
import { toCreatureView } from "@/lib/game/creature-view";
import { computePlayScore } from "@/lib/game/play";
import { getGameRules } from "@/lib/game/rules-service";
import { countPlaysToday, recordPlay } from "@/lib/play/service";

export const dynamic = "force-dynamic";

const resultSchema = z.object({
  healthySpawned: z.coerce.number().int().min(0).max(500),
  healthyCaught: z.coerce.number().int().min(0).max(500),
  junkHit: z.coerce.number().int().min(0).max(500),
});

/** GET /api/play → { playsToday, playsLeft, maxPerDay } */
export async function GET() {
  try {
    const session = await getSession();
    if (!session) return fail("unauthorized", "Connecte-toi pour continuer.", 401);
    const playsToday = await countPlaysToday(session.user.id);
    return ok({ playsToday, playsLeft: Math.max(0, PLAY.maxPerDay - playsToday), maxPerDay: PLAY.maxPerDay });
  } catch (error) {
    return handleRouteError(error);
  }
}

/** POST /api/play { healthySpawned, healthyCaught, junkHit } → effects. */
export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) return fail("unauthorized", "Connecte-toi pour continuer.", 401);
    const body = resultSchema.parse(await request.json().catch(() => ({})));
    const rules = await getGameRules();
    const creature = await getActiveCreatureTicked(session.user.id, new Date(), rules);
    if (!creature || creature.status !== "alive") return fail("no_creature", "Tu n'as pas de créature avec qui jouer.", 409);
    const { score, perfect } = computePlayScore(body);
    const result = await recordPlay(session.user.id, creature, score);
    return ok({
      score,
      perfect,
      effects: result.effects,
      playsToday: result.playsToday,
      playsLeft: result.playsLeft,
      creature: toCreatureView(result.creature, new Date(), rules),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
