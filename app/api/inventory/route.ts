import { fail, handleRouteError, ok } from "@/lib/api/respond";
import { getSession } from "@/lib/auth/session";
import { getInventory, listPurchases } from "@/lib/shop/service";

export const dynamic = "force-dynamic";

/** GET /api/inventory → { inventory, purchases } */
export async function GET() {
  try {
    const session = await getSession();
    if (!session) return fail("unauthorized", "Connecte-toi pour continuer.", 401);
    const [inventory, purchases] = await Promise.all([getInventory(session.user.id), listPurchases(session.user.id)]);
    return ok({ inventory, purchases });
  } catch (error) {
    return handleRouteError(error);
  }
}
