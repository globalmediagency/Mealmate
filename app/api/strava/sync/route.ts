import { fail, handleRouteError, ok } from "@/lib/api/respond";
import { getSession } from "@/lib/auth/session";
import { getHeldCreatures } from "@/lib/boarding/service";
import { toCreatureView } from "@/lib/game/creature-view";
import { getGameRules } from "@/lib/game/rules-service";
import { stravaApi } from "@/lib/strava/api";
import { syncStrava } from "@/lib/strava/service";

export const dynamic = "force-dynamic";

/** POST /api/strava/sync → imports recent activities and applies their effects. */
export async function POST() {
  try {
    const session = await getSession();
    if (!session) return fail("unauthorized", "Connecte-toi pour continuer.", 401);
    const now = new Date();
    const rules = await getGameRules();
    const held = await getHeldCreatures(session.user.id, now, rules);
    // The own creature away at a friend's is not credited (the host's steps feed it); boarded ones are.
    const result = await syncStrava(session.user.id, stravaApi, held.away ? null : held.own, now, held.boarded.map((h) => h.creature));
    return ok({
      imported: result.imported,
      skipped: result.skipped,
      gains: result.gains,
      status: result.status,
      creature: result.creature ? toCreatureView(result.creature, now, rules) : null,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
