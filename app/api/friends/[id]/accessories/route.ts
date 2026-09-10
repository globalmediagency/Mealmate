import { z } from "zod";
import { fail, handleRouteError, ok } from "@/lib/api/respond";
import { getSession } from "@/lib/auth/session";
import { tradeableAccessories } from "@/lib/trades/service";

export const dynamic = "force-dynamic";

const idSchema = z.string().uuid();

/** GET /api/friends/:id/accessories → what can be swapped with this friend. */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    if (!session) return fail("unauthorized", "Connecte-toi pour continuer.", 401);
    const { id } = await context.params;
    return ok(await tradeableAccessories(session.user.id, idSchema.parse(id)));
  } catch (error) {
    return handleRouteError(error);
  }
}
