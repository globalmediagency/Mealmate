import { fail, handleRouteError, ok } from "@/lib/api/respond";
import { getSession } from "@/lib/auth/session";
import { markBoardingsSeen } from "@/lib/boarding/service";

export const dynamic = "force-dynamic";

/** POST /api/boardings/seen → the host acknowledged the creatures entrusted to them. */
export async function POST() {
  try {
    const session = await getSession();
    if (!session) return fail("unauthorized", "Connecte-toi pour continuer.", 401);
    await markBoardingsSeen(session.user.id);
    return ok({ seen: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
