import type { NextRequest } from "next/server";
import { z } from "zod";
import { fail, handleRouteError, ok } from "@/lib/api/respond";
import { getSession } from "@/lib/auth/session";
import { applyStepGains, getActiveCreatureTicked, refreshEggSteps } from "@/lib/creatures/service";
import { STEPS } from "@/lib/game/config";
import { toCreatureView } from "@/lib/game/creature-view";
import { getGameRules } from "@/lib/game/rules-service";
import { gameDate } from "@/lib/game/time";
import { getManualEntry, getStepHistory, saveManualSteps } from "@/lib/steps/service";

export const dynamic = "force-dynamic";

const saveSchema = z.object({
  steps: z.coerce.number().int().min(0).max(STEPS.maxManualPerDay),
});

/** GET /api/steps?days=14 → { today, history } */
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return fail("unauthorized", "Connecte-toi pour continuer.", 401);
    const days = Math.min(90, Math.max(1, Number(request.nextUrl.searchParams.get("days") ?? 14) || 14));
    const today = gameDate();
    const [entry, history] = await Promise.all([
      getManualEntry(session.user.id, today),
      getStepHistory(session.user.id, days, today),
    ]);
    return ok({ date: today, today: entry?.steps ?? 0, history });
  } catch (error) {
    return handleRouteError(error);
  }
}

/** POST /api/steps { steps } → saves today's manual entry and applies effects. */
export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) return fail("unauthorized", "Connecte-toi pour continuer.", 401);
    const body = saveSchema.parse(await request.json().catch(() => ({})));
    const userId = session.user.id;

    const rules = await getGameRules();
    const creature = await getActiveCreatureTicked(userId, new Date(), rules);
    const { entry, gains } = await saveManualSteps(userId, body.steps, creature);
    let updated = creature;
    if (creature?.status === "egg") updated = await refreshEggSteps(creature);
    else if (creature?.status === "alive") updated = await applyStepGains(creature, gains);

    return ok({
      date: entry.date,
      today: entry.steps,
      gains,
      creature: updated ? toCreatureView(updated, new Date(), rules) : null,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
