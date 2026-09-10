import { z } from "zod";
import { SLOTS } from "@/lib/accessories/catalog";
import { equipAccessory, getChestStatus, getOutfit, getOwnedAccessories } from "@/lib/accessories/service";
import { fail, handleRouteError, ok } from "@/lib/api/respond";
import { getSession } from "@/lib/auth/session";
import { getActiveCreatureTicked } from "@/lib/creatures/service";

export const dynamic = "force-dynamic";

const equipSchema = z.object({ slot: z.enum(SLOTS), accessoryId: z.string().min(1).max(60).nullable() });

/** GET /api/accessories → { owned, outfit, chest } */
export async function GET() {
  try {
    const session = await getSession();
    if (!session) return fail("unauthorized", "Connecte-toi pour continuer.", 401);
    const creature = await getActiveCreatureTicked(session.user.id);
    const owned = await getOwnedAccessories(session.user.id);
    const outfit = creature?.status === "alive" ? await getOutfit(creature.id) : {};
    const chest = creature ? await getChestStatus(creature) : null;
    return ok({ owned: owned.map((o) => ({ ...o.accessory, obtainedAt: o.obtainedAt.toISOString() })), outfit, chest });
  } catch (error) {
    return handleRouteError(error);
  }
}

/** POST /api/accessories { slot, accessoryId | null } → equips / removes. */
export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) return fail("unauthorized", "Connecte-toi pour continuer.", 401);
    const body = equipSchema.parse(await request.json().catch(() => ({})));
    const creature = await getActiveCreatureTicked(session.user.id);
    if (!creature || creature.status !== "alive") return fail("no_creature", "Seule une créature vivante peut être habillée.", 409);
    const outfit = await equipAccessory(session.user.id, creature, body.slot, body.accessoryId);
    return ok({ outfit });
  } catch (error) {
    return handleRouteError(error);
  }
}
