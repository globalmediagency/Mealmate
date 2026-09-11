import { z } from "zod";
import { fail, handleRouteError, ok } from "@/lib/api/respond";
import { getSession } from "@/lib/auth/session";
import { giftAccessory } from "@/lib/trades/service";

export const dynamic = "force-dynamic";

const idSchema = z.string().uuid();
const bodySchema = z.object({ accessoryId: z.string().min(1).max(60) });

/** POST /api/friends/:id/gift { accessoryId } → gives one copy to the friend (no acceptance needed). */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    if (!session) return fail("unauthorized", "Connecte-toi pour continuer.", 401);
    const { id } = await context.params;
    const body = bodySchema.parse(await request.json().catch(() => ({})));
    const outcome = await giftAccessory(session.user.id, idSchema.parse(id), body.accessoryId);
    return ok({ friend: outcome.friend, accessory: outcome.accessory, copiesLeft: outcome.copiesLeft });
  } catch (error) {
    return handleRouteError(error);
  }
}
