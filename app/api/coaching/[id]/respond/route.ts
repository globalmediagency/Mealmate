import { z } from "zod";
import { fail, handleRouteError, ok } from "@/lib/api/respond";
import { getSession } from "@/lib/auth/session";
import { respondToProposal } from "@/lib/coaching/service";

export const dynamic = "force-dynamic";

const idSchema = z.string().uuid();
const bodySchema = z.object({ accept: z.boolean() });

/** POST /api/coaching/:id/respond { accept } → the friend accepts or declines becoming the coach. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    if (!session) return fail("unauthorized", "Connecte-toi pour continuer.", 401);
    const { id } = await context.params;
    const body = bodySchema.parse(await request.json().catch(() => ({})));
    return ok({ coaching: await respondToProposal(session.user.id, idSchema.parse(id), body.accept) });
  } catch (error) {
    return handleRouteError(error);
  }
}
