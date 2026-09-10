import { z } from "zod";
import { fail, handleRouteError, ok } from "@/lib/api/respond";
import { getSession } from "@/lib/auth/session";
import { loadActiveCreatureView } from "@/lib/creatures/loader";
import { createEgg, tierSchema } from "@/lib/creatures/service";
import { toCreatureView } from "@/lib/game/creature-view";

export const dynamic = "force-dynamic";

const createSchema = z.object({ tier: tierSchema });

/** GET /api/creatures → { creature } (egg or living creature, or null). */
export async function GET() {
  try {
    const session = await getSession();
    if (!session) return fail("unauthorized", "Connecte-toi pour continuer.", 401);
    return ok({ creature: await loadActiveCreatureView(session.user.id) });
  } catch (error) {
    return handleRouteError(error);
  }
}

/** POST /api/creatures { tier } → creates an egg. */
export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) return fail("unauthorized", "Connecte-toi pour continuer.", 401);
    const body = createSchema.parse(await request.json().catch(() => ({})));
    const egg = await createEgg(session.user.id, body.tier);
    return ok({ creature: toCreatureView(egg) }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
