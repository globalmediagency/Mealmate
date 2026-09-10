import { openChest } from "@/lib/accessories/service";
import { fail, handleRouteError, ok } from "@/lib/api/respond";
import { getSession } from "@/lib/auth/session";
import { getActiveCreatureTicked } from "@/lib/creatures/service";

export const dynamic = "force-dynamic";

/** POST /api/accessories/open → opens one earned chest. */
export async function POST() {
  try {
    const session = await getSession();
    if (!session) return fail("unauthorized", "Connecte-toi pour continuer.", 401);
    const creature = await getActiveCreatureTicked(session.user.id);
    if (!creature || creature.status !== "alive") return fail("no_creature", "Il faut une créature vivante pour ouvrir un coffre.", 409);
    const reward = await openChest(session.user.id, creature);
    return ok({ ...reward });
  } catch (error) {
    return handleRouteError(error);
  }
}
