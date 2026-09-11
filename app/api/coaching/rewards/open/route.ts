import { z } from "zod";
import { fail, handleRouteError, ok } from "@/lib/api/respond";
import { getSession } from "@/lib/auth/session";
import { openCoachingReward } from "@/lib/coaching/service";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ role: z.enum(["student", "coach"]) });

/** POST /api/coaching/rewards/open { role } → opens one earned surprise accessory. Shaped like a chest reward for the reveal screen. */
export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) return fail("unauthorized", "Connecte-toi pour continuer.", 401);
    const body = bodySchema.parse(await request.json().catch(() => ({})));
    const reward = await openCoachingReward(session.user.id, body.role);
    const { reward: status, ...rest } = reward;
    return ok({
      ...rest,
      equipped: false,
      status: { totalSteps: status.points, earned: status.earned, opened: status.opened, available: status.available, stepsToNext: status.toNext, stepsPerChest: status.per },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
