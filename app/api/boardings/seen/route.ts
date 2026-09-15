import { z } from "zod";
import { fail, handleRouteError, ok } from "@/lib/api/respond";
import { getSession } from "@/lib/auth/session";
import { markBoardingsSeen, markOwnerNoticesSeen } from "@/lib/boarding/service";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ boardingId: z.string().uuid().optional(), role: z.enum(["host", "owner"]).default("host") });

/** POST /api/boardings/seen { boardingId?, role? } → the host dismissed a notice (death), or the owner saw the host's answer. */
export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) return fail("unauthorized", "Connecte-toi pour continuer.", 401);
    const body = bodySchema.parse(await request.json().catch(() => ({})));
    if (body.role === "owner") await markOwnerNoticesSeen(session.user.id);
    else await markBoardingsSeen(session.user.id, new Date(), body.boardingId);
    return ok({ seen: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
