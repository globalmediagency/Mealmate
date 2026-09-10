import { z } from "zod";
import { fail, handleRouteError, ok } from "@/lib/api/respond";
import { getSession } from "@/lib/auth/session";
import { confirmCheckout, getInventory } from "@/lib/shop/service";
import { stripeProvider } from "@/lib/shop/stripe-provider";

export const dynamic = "force-dynamic";

const sessionIdSchema = z.string().min(5).max(200);

/** GET /api/shop/confirm?session_id=… → credits a paid session when the webhook has not run yet. */
export async function GET(request: Request) {
  try {
    const session = await getSession();
    if (!session) return fail("unauthorized", "Connecte-toi pour continuer.", 401);
    const sessionId = sessionIdSchema.parse(new URL(request.url).searchParams.get("session_id"));
    const outcome = await confirmCheckout(session.user.id, sessionId, stripeProvider);
    return ok({ ...outcome, inventory: await getInventory(session.user.id) });
  } catch (error) {
    return handleRouteError(error);
  }
}
