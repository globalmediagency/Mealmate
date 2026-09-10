import { z } from "zod";
import { fail, handleRouteError, ok } from "@/lib/api/respond";
import { getSession } from "@/lib/auth/session";
import { listTrades, proposeTrade } from "@/lib/trades/service";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  friendshipId: z.string().uuid(),
  offeredId: z.string().min(1).max(60),
  requestedId: z.string().min(1).max(60),
});

/** GET /api/trades → { incoming, outgoing, recent } */
export async function GET() {
  try {
    const session = await getSession();
    if (!session) return fail("unauthorized", "Connecte-toi pour continuer.", 401);
    return ok(await listTrades(session.user.id));
  } catch (error) {
    return handleRouteError(error);
  }
}

/** POST /api/trades { friendshipId, offeredId, requestedId } → proposes a swap. */
export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) return fail("unauthorized", "Connecte-toi pour continuer.", 401);
    const body = bodySchema.parse(await request.json().catch(() => ({})));
    await proposeTrade(session.user.id, body.friendshipId, body.offeredId, body.requestedId);
    return ok(await listTrades(session.user.id), { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
