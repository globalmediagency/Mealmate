import { z } from "zod";
import { fail, handleRouteError, ok } from "@/lib/api/respond";
import { snapshot } from "@/lib/arena/service";
import { getSession } from "@/lib/auth/session";
import { getGameRules } from "@/lib/game/rules-service";

export const dynamic = "force-dynamic";

const idSchema = z.string().uuid();
const sinceSchema = z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER);

/**
 * GET /api/arena/:id[?since=<event id>] → the match as the player's phone must
 * draw it. Without `since`: full snapshot (creatures included, no events);
 * with it: the news after that cursor (spec § 3.22, short polling).
 */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    if (!session) return fail("unauthorized", "Connecte-toi pour continuer.", 401);
    const { id } = await context.params;
    const sinceRaw = new URL(request.url).searchParams.get("since");
    const since = sinceRaw === null ? undefined : sinceSchema.parse(sinceRaw);
    const data = await snapshot(session.user.id, idSchema.parse(id), new Date(), await getGameRules(), { since });
    return ok(data, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return handleRouteError(error);
  }
}
