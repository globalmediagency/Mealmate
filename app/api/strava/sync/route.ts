import { fail, handleRouteError, ok } from "@/lib/api/respond";
import { getSession } from "@/lib/auth/session";
import { getActiveCreatureTicked } from "@/lib/creatures/service";
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
    const creature = await getActiveCreatureTicked(session.user.id, now, rules);
    const result = await syncStrava(session.user.id, stravaApi, creature, now);
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
