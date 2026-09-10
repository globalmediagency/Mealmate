import { z } from "zod";
import { fail, handleRouteError, ok } from "@/lib/api/respond";
import { getSession } from "@/lib/auth/session";
import { removeFriendship } from "@/lib/friends/service";

export const dynamic = "force-dynamic";

const idSchema = z.string().uuid();

/** DELETE /api/friends/:id → declines, cancels or removes. */
export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    if (!session) return fail("unauthorized", "Connecte-toi pour continuer.", 401);
    const { id } = await context.params;
    await removeFriendship(session.user.id, idSchema.parse(id));
    return ok({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
