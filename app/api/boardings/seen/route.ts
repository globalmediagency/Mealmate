import { z } from "zod";
import { fail, handleRouteError, ok } from "@/lib/api/respond";
import { getSession } from "@/lib/auth/session";
import { markBoardingsSeen } from "@/lib/boarding/service";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ boardingId: z.string().uuid().optional() });

/** POST /api/boardings/seen { boardingId? } → the host acknowledged the creatures entrusted to them (or one stay's death notice). */
export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) return fail("unauthorized", "Connecte-toi pour continuer.", 401);
    const body = bodySchema.parse(await request.json().catch(() => ({})));
    await markBoardingsSeen(session.user.id, new Date(), body.boardingId);
    return ok({ seen: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
