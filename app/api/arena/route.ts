import { z } from "zod";
import { fail, handleRouteError, ok } from "@/lib/api/respond";
import { createMatch, listMatchesFor, snapshot } from "@/lib/arena/service";
import { getSession } from "@/lib/auth/session";
import { ARENA } from "@/lib/game/config";
import { getGameRules } from "@/lib/game/rules-service";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  friendIds: z.array(z.string().min(1).max(64)).min(1).max(ARENA.maxPlayers - 1),
  /** `arena` (everyone for themselves) or `coop` ("Défendre à deux"). */
  mode: z.enum(["arena", "coop"]).default("arena"),
});

/** GET /api/arena → the user's invitations, open matches and latest results (spec § 3.22). */
export async function GET() {
  try {
    const session = await getSession();
    if (!session) return fail("unauthorized", "Connecte-toi pour continuer.", 401);
    return ok(await listMatchesFor(session.user.id, new Date(), await getGameRules()));
  } catch (error) {
    return handleRouteError(error);
  }
}

/** POST /api/arena { friendIds } → opens a lobby with these accepted friends. */
export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) return fail("unauthorized", "Connecte-toi pour continuer.", 401);
    const body = createSchema.parse(await request.json().catch(() => ({})));
    const now = new Date();
    const rules = await getGameRules();
    const { match } = await createMatch(session.user.id, body.friendIds, now, rules, { mode: body.mode });
    return ok(await snapshot(session.user.id, match.id, now, rules), { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
