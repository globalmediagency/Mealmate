import { z } from "zod";
import { fail, handleRouteError, ok } from "@/lib/api/respond";
import { getSession } from "@/lib/auth/session";
import { getHeldCreature } from "@/lib/boarding/service";
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
  /** A creature boarded with the user (default: the user's own creature). */
  creatureId: z.string().uuid().optional(),
});

/** GET /api/play?creature=<id> → { playsToday, playsLeft, maxPerDay } for that creature (default: the user's own). */
export async function GET(request: Request) {
  try {
    const session = await getSession();
    if (!session) return fail("unauthorized", "Connecte-toi pour continuer.", 401);
    const creatureId = new URL(request.url).searchParams.get("creature");
    const held = await getHeldCreature(session.user.id, creatureId);
    const playsToday = await countPlaysToday(held.creature.id);
    return ok({ playsToday, playsLeft: Math.max(0, PLAY.maxPerDay - playsToday), maxPerDay: PLAY.maxPerDay });
  } catch (error) {
    return handleRouteError(error);
  }
}

/** POST /api/play { healthySpawned, healthyCaught, junkHit, creatureId? } → effects. */
export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) return fail("unauthorized", "Connecte-toi pour continuer.", 401);
    const body = resultSchema.parse(await request.json().catch(() => ({})));
    const rules = await getGameRules();
    const held = await getHeldCreature(session.user.id, body.creatureId, new Date(), rules);
    const creature = held.creature;
    if (creature.status !== "alive") return fail("no_creature", "Tu n'as pas de créature avec qui jouer.", 409);
    const { score, perfect } = computePlayScore(body);
    const result = await recordPlay(session.user.id, creature, score, new Date(), { boarded: held.boarding !== null });
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
