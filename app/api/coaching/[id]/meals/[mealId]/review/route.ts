import { z } from "zod";
import { fail, handleRouteError, ok } from "@/lib/api/respond";
import { getSession } from "@/lib/auth/session";
import { reviewMeal } from "@/lib/coaching/service";

export const dynamic = "force-dynamic";

const idSchema = z.string().uuid();
const bodySchema = z.object({ verdict: z.enum(["up", "down"]) });

/** POST /api/coaching/:id/meals/:mealId/review { verdict } → the coach's thumb on one of the student's meals. */
export async function POST(request: Request, context: { params: Promise<{ id: string; mealId: string }> }) {
  try {
    const session = await getSession();
    if (!session) return fail("unauthorized", "Connecte-toi pour continuer.", 401);
    const { id, mealId } = await context.params;
    const body = bodySchema.parse(await request.json().catch(() => ({})));
    return ok(await reviewMeal(session.user.id, idSchema.parse(id), idSchema.parse(mealId), body.verdict));
  } catch (error) {
    return handleRouteError(error);
  }
}
