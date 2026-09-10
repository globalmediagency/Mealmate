import { fail, handleRouteError, ok } from "@/lib/api/respond";
import { getSession } from "@/lib/auth/session";
import { stravaApi } from "@/lib/strava/api";
import { disconnectStrava, getStravaStatus } from "@/lib/strava/service";

export const dynamic = "force-dynamic";

/** GET /api/strava → connection status (never the tokens). */
export async function GET() {
  try {
    const session = await getSession();
    if (!session) return fail("unauthorized", "Connecte-toi pour continuer.", 401);
    return ok(await getStravaStatus(session.user.id));
  } catch (error) {
    return handleRouteError(error);
  }
}

/** DELETE /api/strava → revokes and forgets the connection (imported steps are kept). */
export async function DELETE() {
  try {
    const session = await getSession();
    if (!session) return fail("unauthorized", "Connecte-toi pour continuer.", 401);
    await disconnectStrava(session.user.id, stravaApi);
    return ok({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
