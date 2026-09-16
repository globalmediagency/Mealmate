import { z } from "zod";
import { fail, handleRouteError, ok } from "@/lib/api/respond";
import { cancelMatch, eatBonuses, leaveMatch, recordShot, respondToInvite, startMatch } from "@/lib/arena/service";
import { getSession } from "@/lib/auth/session";
import { getGameRules } from "@/lib/game/rules-service";

export const dynamic = "force-dynamic";

const idSchema = z.string().uuid();
const coordinate = z.coerce.number().finite().min(-20).max(20);

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("join") }),
  z.object({ action: z.literal("decline") }),
  z.object({ action: z.literal("start") }),
  z.object({ action: z.literal("leave") }),
  z.object({ action: z.literal("cancel") }),
  z.object({
    action: z.literal("shoot"),
    targetUserId: z.string().min(1).max(64).nullable().default(null),
    x: coordinate.default(0),
    y: coordinate.default(0),
    hit: z.boolean().default(false),
  }),
  z.object({
    action: z.literal("eat"),
    bonusIds: z.array(z.string().uuid()).max(10).default([]),
    angle: z.coerce.number().finite().default(0),
    length: z.coerce.number().finite().min(0).max(10).default(0),
  }),
]);

/**
 * POST /api/arena/:id/action { action, … } → lobby moves (join, decline,
 * start, leave, cancel) return the new snapshot; battle moves (shoot, eat)
 * return their outcome. The phone judges the geometry, the server the rules.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    if (!session) return fail("unauthorized", "Connecte-toi pour continuer.", 401);
    const { id } = await context.params;
    const matchId = idSchema.parse(id);
    const body = actionSchema.parse(await request.json().catch(() => ({})));
    const now = new Date();
    const rules = await getGameRules();
    const userId = session.user.id;
    switch (body.action) {
      case "join":
        return ok(await respondToInvite(userId, matchId, true, now, rules));
      case "decline":
        return ok(await respondToInvite(userId, matchId, false, now, rules));
      case "start":
        return ok(await startMatch(userId, matchId, now, rules));
      case "leave":
        return ok(await leaveMatch(userId, matchId, now, rules));
      case "cancel":
        return ok(await cancelMatch(userId, matchId, now, rules));
      case "shoot":
        return ok(await recordShot(userId, matchId, { targetUserId: body.targetUserId, x: body.x, y: body.y, hit: body.hit }, now));
      case "eat":
        return ok(await eatBonuses(userId, matchId, { bonusIds: body.bonusIds, angle: body.angle, length: body.length }, now));
    }
  } catch (error) {
    return handleRouteError(error);
  }
}
