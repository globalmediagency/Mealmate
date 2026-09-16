import { z } from "zod";
import { fail, handleRouteError, ok } from "@/lib/api/respond";
import { assertArenaPlayer } from "@/lib/arena/service";
import { getTurnIceServers, TURN_TTL_SECONDS } from "@/lib/arena/turn";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

const idSchema = z.string().uuid();

/**
 * GET /api/arena/:id/ice → the TURN relay's ICE servers with short-lived
 * credentials for a player of an open match (spec § 3.22). Empty when the
 * relay is not configured: the phone keeps public STUN only.
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    if (!session) return fail("unauthorized", "Connecte-toi pour continuer.", 401);
    const { id } = await context.params;
    await assertArenaPlayer(session.user.id, idSchema.parse(id));
    const servers = await getTurnIceServers();
    return ok({ iceServers: servers ?? [], ttl: servers ? TURN_TTL_SECONDS : 0 }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return handleRouteError(error);
  }
}
