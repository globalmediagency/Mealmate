import { z } from "zod";
import { fail, handleRouteError, ok } from "@/lib/api/respond";
import { getSession } from "@/lib/auth/session";
import { listTrades, withdrawTrade } from "@/lib/trades/service";

export const dynamic = "force-dynamic";

const idSchema = z.string().uuid();

/** DELETE /api/trades/:id → declines (receiver) or withdraws (proposer) a pending swap. */
export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    if (!session) return fail("unauthorized", "Connecte-toi pour continuer.", 401);
    const { id } = await context.params;
    await withdrawTrade(session.user.id, idSchema.parse(id));
    return ok(await listTrades(session.user.id));
  } catch (error) {
    return handleRouteError(error);
  }
}
