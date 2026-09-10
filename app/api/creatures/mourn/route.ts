import { fail, handleRouteError, ok } from "@/lib/api/respond";
import { getSession } from "@/lib/auth/session";
import { mournCreatures } from "@/lib/creatures/service";

export const dynamic = "force-dynamic";

/** POST /api/creatures/mourn → acknowledges the death, unlocking the egg choice. */
export async function POST() {
  try {
    const session = await getSession();
    if (!session) return fail("unauthorized", "Connecte-toi pour continuer.", 401);
    await mournCreatures(session.user.id);
    return ok({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
