import { z } from "zod";
import { fail, handleRouteError, ok } from "@/lib/api/respond";
import { getSession } from "@/lib/auth/session";
import { acceptTrade, listTrades } from "@/lib/trades/service";

export const dynamic = "force-dynamic";

const idSchema = z.string().uuid();

/** POST /api/trades/:id/accept → swaps the two accessories. */
export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    if (!session) return fail("unauthorized", "Connecte-toi pour continuer.", 401);
    const { id } = await context.params;
    const trade = await acceptTrade(session.user.id, idSchema.parse(id));
    return ok({ trade: { id: trade.id, status: trade.status }, ...(await listTrades(session.user.id)) });
  } catch (error) {
    return handleRouteError(error);
  }
}
