import { z } from "zod";
import { fail, handleRouteError, ok } from "@/lib/api/respond";
import { getSession } from "@/lib/auth/session";
import { proposeCoach } from "@/lib/coaching/service";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ friendshipId: z.string().uuid() });

/** POST /api/coaching { friendshipId } → asks this friend to become my coach. */
export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) return fail("unauthorized", "Connecte-toi pour continuer.", 401);
    const body = bodySchema.parse(await request.json().catch(() => ({})));
    return ok({ coaching: await proposeCoach(session.user.id, body.friendshipId) });
  } catch (error) {
    return handleRouteError(error);
  }
}
