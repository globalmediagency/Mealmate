import { z } from "zod";
import { fail, handleRouteError, ok } from "@/lib/api/respond";
import { getSession } from "@/lib/auth/session";
import { getHeldCreature } from "@/lib/boarding/service";
import { toCreatureView } from "@/lib/game/creature-view";
import { computeDefenseScore } from "@/lib/game/defense";
import { getGameRules } from "@/lib/game/rules-service";
import { recordPlay } from "@/lib/play/service";

export const dynamic = "force-dynamic";

const resultSchema = z.object({
  spawned: z.coerce.number().int().min(0).max(10_000),
  destroyed: z.coerce.number().int().min(0).max(10_000),
  reached: z.coerce.number().int().min(0).max(10_000),
  wavesCleared: z.coerce.number().int().min(0).max(1000),
  /** A creature boarded with the user (default: the user's own creature). */
  creatureId: z.string().uuid().optional(),
});

/**
 * POST /api/defense { spawned, destroyed, reached, wavesCleared, creatureId? } → effects.
 * The reward comes from the counters, bounded by what the cleared waves could
 * have spawned (spec § 3.21); the game shares the daily limit of the food catch.
 */
export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) return fail("unauthorized", "Connecte-toi pour continuer.", 401);
    const body = resultSchema.parse(await request.json().catch(() => ({})));
    const rules = await getGameRules();
    const held = await getHeldCreature(session.user.id, body.creatureId, new Date(), rules);
    const creature = held.creature;
    if (creature.status !== "alive") return fail("no_creature", "Tu n'as pas de créature à défendre.", 409);
    const { score, perfect } = computeDefenseScore(body, rules.defense);
    const result = await recordPlay(session.user.id, creature, score, new Date(), { boarded: held.boarding !== null }, rules, "defense");
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
