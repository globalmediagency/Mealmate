import { z } from "zod";
import { fail, handleRouteError, ok } from "@/lib/api/respond";
import { getSession } from "@/lib/auth/session";
import { acceptFriendRequest } from "@/lib/friends/service";

export const dynamic = "force-dynamic";

const idSchema = z.string().uuid();

/** POST /api/friends/:id/accept → accepts an incoming request. */
export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    if (!session) return fail("unauthorized", "Connecte-toi pour continuer.", 401);
    const { id } = await context.params;
    await acceptFriendRequest(session.user.id, idSchema.parse(id));
    return ok({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
