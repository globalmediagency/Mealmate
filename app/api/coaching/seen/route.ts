import { fail, handleRouteError, ok } from "@/lib/api/respond";
import { getSession } from "@/lib/auth/session";
import { markStudentNoticesSeen } from "@/lib/coaching/service";

export const dynamic = "force-dynamic";

/** POST /api/coaching/seen → the student saw the coach's answer or the end of the coaching. */
export async function POST() {
  try {
    const session = await getSession();
    if (!session) return fail("unauthorized", "Connecte-toi pour continuer.", 401);
    await markStudentNoticesSeen(session.user.id);
    return ok({ seen: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
