import { fail, handleRouteError, ok } from "@/lib/api/respond";
import { listArenaInvites } from "@/lib/arena/service";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** GET /api/arena/notices → `{ invites, now }`: the pending invitations, polled by every page (spec § 3.22). */
export async function GET() {
  try {
    const session = await getSession();
    if (!session) return fail("unauthorized", "Connecte-toi pour continuer.", 401);
    const now = new Date();
    return ok({ invites: await listArenaInvites(session.user.id, now), now: now.toISOString() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return handleRouteError(error);
  }
}
