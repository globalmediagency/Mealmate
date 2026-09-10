import { fail, handleRouteError, ok } from "@/lib/api/respond";
import { getSession } from "@/lib/auth/session";
import { markGiftsSeen } from "@/lib/shop/service";

export const dynamic = "force-dynamic";

/** POST /api/gifts/seen → acknowledges the medicine received from friends. */
export async function POST() {
  try {
    const session = await getSession();
    if (!session) return fail("unauthorized", "Connecte-toi pour continuer.", 401);
    await markGiftsSeen(session.user.id);
    return ok({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
