import { z } from "zod";
import { fail, handleRouteError, ok } from "@/lib/api/respond";
import { getSession } from "@/lib/auth/session";
import { getOwnedBackdrops, setCreatureBackdrop } from "@/lib/backdrops/service";
import { getActiveCreatureTicked } from "@/lib/creatures/service";

export const dynamic = "force-dynamic";

const pickSchema = z.object({ backdropId: z.string().min(1).max(40).nullable() });

/** GET /api/backdrops → { owned, current } : the chest backdrops found and the living creature's pick (null = the design's scene). */
export async function GET() {
  try {
    const session = await getSession();
    if (!session) return fail("unauthorized", "Connecte-toi pour continuer.", 401);
    const [owned, creature] = await Promise.all([getOwnedBackdrops(session.user.id), getActiveCreatureTicked(session.user.id)]);
    return ok({
      owned: owned.map((o) => ({ ...o.backdrop, obtainedAt: o.obtainedAt.toISOString() })),
      current: creature?.status === "alive" ? creature.backdrop : null,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

/** POST /api/backdrops { backdropId | null } → puts a backdrop behind the user's creature (null = follow the design). */
export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) return fail("unauthorized", "Connecte-toi pour continuer.", 401);
    const body = pickSchema.parse(await request.json().catch(() => ({})));
    const creature = await getActiveCreatureTicked(session.user.id);
    if (!creature || creature.status !== "alive") return fail("no_creature", "Seule une créature vivante peut changer de décor.", 409);
    const backdrop = await setCreatureBackdrop(session.user.id, creature, body.backdropId);
    return ok({ backdrop });
  } catch (error) {
    return handleRouteError(error);
  }
}
