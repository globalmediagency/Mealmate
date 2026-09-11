import type { NextRequest } from "next/server";
import { z } from "zod";
import { fail, handleRouteError, ok } from "@/lib/api/respond";
import { getSession } from "@/lib/auth/session";
import { saveStepsForHeld } from "@/lib/boarding/service";
import { STEPS } from "@/lib/game/config";
import { toCreatureView } from "@/lib/game/creature-view";
import { getGameRules } from "@/lib/game/rules-service";
import { gameDate } from "@/lib/game/time";
import { getManualEntry, getStepHistory } from "@/lib/steps/service";

export const dynamic = "force-dynamic";

const saveSchema = z.object({
  steps: z.coerce.number().int().min(0).max(STEPS.maxManualPerDay),
  /** "add" (default) stacks on today's total; "set" replaces it to fix a mistake. */
  mode: z.enum(["add", "set"]).default("add"),
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

/** POST /api/steps { steps, mode? } → adds to (or sets) today's manual entry and applies effects. */
export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) return fail("unauthorized", "Connecte-toi pour continuer.", 401);
    const body = saveSchema.parse(await request.json().catch(() => ({})));
    const userId = session.user.id;

    const rules = await getGameRules();
    // Steps feed every living creature in the user's care (own when home + boarded ones); the egg counts them for hatching.
    const { entry, gains, added, own, credited } = await saveStepsForHeld(userId, body.steps, body.mode, gameDate(), new Date(), rules);

    return ok({
      date: entry.date,
      today: entry.steps,
      added,
      gains,
      creature: own ? toCreatureView(own, new Date(), rules) : null,
      credited,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
