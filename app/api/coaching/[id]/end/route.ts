import { z } from "zod";
import { fail, handleRouteError, ok } from "@/lib/api/respond";
import { getSession } from "@/lib/auth/session";
import { endCoaching } from "@/lib/coaching/service";

export const dynamic = "force-dynamic";

const idSchema = z.string().uuid();

/** POST /api/coaching/:id/end → either side ends (or withdraws / declines) the coaching. */
export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    if (!session) return fail("unauthorized", "Connecte-toi pour continuer.", 401);
    const { id } = await context.params;
    return ok({ coaching: await endCoaching(session.user.id, idSchema.parse(id)) });
  } catch (error) {
    return handleRouteError(error);
  }
}
