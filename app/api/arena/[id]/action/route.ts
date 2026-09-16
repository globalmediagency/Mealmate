import { z } from "zod";
import { fail, handleRouteError, ok } from "@/lib/api/respond";
import { cancelMatch, eatBonuses, finishCoop, leaveMatch, logCoopEvent, recordShot, respondToInvite, startMatch, storeCoopState } from "@/lib/arena/service";
import { getSession } from "@/lib/auth/session";
import { getGameRules } from "@/lib/game/rules-service";

export const dynamic = "force-dynamic";

const idSchema = z.string().uuid();
const coordinate = z.coerce.number().finite().min(-20).max(20);
const counter = z.coerce.number().int().min(0).max(100_000);
const summarySchema = z.object({
  spawned: counter,
  destroyed: counter,
  reached: counter,
  wavesCleared: z.coerce.number().int().min(0).max(1000),
  shots: counter,
  bosses: counter,
  goodEaten: counter,
  healed: counter,
  junkEaten: counter,
  goodWasted: counter,
});
const idList = z.array(z.number().int().min(0)).max(64);
const frame = z.string().min(1).max(64);
/** The host's simulation is a few kilobytes; refuse anything absurd. */
const MAX_STATE_JSON = 262_144;

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
    nonce: z.string().max(64).optional(),
  }),
  z.object({
    action: z.literal("eat"),
    bonusIds: z.array(z.string().uuid()).max(10).default([]),
    angle: z.coerce.number().finite().default(0),
    length: z.coerce.number().finite().min(0).max(10).default(0),
    nonce: z.string().max(64).optional(),
  }),
  // "Défendre à deux" (spec § 3.23): the host publishes its simulation, everybody relays eggs, landings, tongues and catches, anyone ready may end.
  z.object({ action: z.literal("state"), state: z.unknown() }),
  z.object({
    action: z.literal("fire"),
    frame,
    x: coordinate,
    y: coordinate,
    from: z.object({ x: coordinate, y: coordinate, z: coordinate }).nullable().default(null),
    nonce: z.string().max(64).optional(),
  }),
  z.object({ action: z.literal("smash"), frame, hits: idList, x: coordinate, y: coordinate, nonce: z.string().max(64).optional() }),
  z.object({ action: z.literal("lick"), frame, angle: z.coerce.number().finite(), length: z.coerce.number().finite().min(0).max(10), nonce: z.string().max(64).optional() }),
  z.object({ action: z.literal("catch"), frame, bonusIds: idList, junkIds: idList, nonce: z.string().max(64).optional() }),
  z.object({ action: z.literal("finish"), summaries: z.record(z.string().min(1).max(64), summarySchema) }),
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
        return ok(await recordShot(userId, matchId, { targetUserId: body.targetUserId, x: body.x, y: body.y, hit: body.hit, nonce: body.nonce }, now));
      case "eat":
        return ok(await eatBonuses(userId, matchId, { bonusIds: body.bonusIds, angle: body.angle, length: body.length, nonce: body.nonce }, now));
      case "state": {
        if (JSON.stringify(body.state ?? null).length > MAX_STATE_JSON) return fail("validation_error", "État de partie trop volumineux.", 413);
        await storeCoopState(userId, matchId, body.state, now);
        return ok({ stored: true });
      }
      case "fire":
      case "smash":
      case "lick":
      case "catch": {
        const { action, ...payload } = body;
        await logCoopEvent(userId, matchId, action, payload, now);
        return ok({ logged: true });
      }
      case "finish":
        return ok(await finishCoop(userId, matchId, body.summaries, now, rules));
    }
  } catch (error) {
    return handleRouteError(error);
  }
}
