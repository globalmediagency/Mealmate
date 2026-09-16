import { z } from "zod";
import { fail, handleRouteError, ok } from "@/lib/api/respond";
import { listSignals, postSignal } from "@/lib/arena/service";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

const idSchema = z.string().uuid();
const sinceSchema = z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const signalSchema = z.object({
  to: z.string().min(1).max(64),
  type: z.enum(["hello", "offer", "answer"]),
  /** Session of the sending phone (a reload starts a new one). */
  session: z.string().min(1).max(64),
  /** For an answer: the session of the offer it replies to. */
  target: z.string().max(64).optional(),
  sdp: z.string().max(32_768).optional(),
});

/** GET /api/arena/:id/signals?since=<event id> → WebRTC signals addressed to the caller (spec § 3.22). */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    if (!session) return fail("unauthorized", "Connecte-toi pour continuer.", 401);
    const { id } = await context.params;
    const since = sinceSchema.parse(new URL(request.url).searchParams.get("since") ?? "0");
    return ok(await listSignals(session.user.id, idSchema.parse(id), since), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return handleRouteError(error);
  }
}

/** POST /api/arena/:id/signals { to, type, session, target?, sdp? } → hands a signal to another player of the match. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    if (!session) return fail("unauthorized", "Connecte-toi pour continuer.", 401);
    const { id } = await context.params;
    const { to, ...payload } = signalSchema.parse(await request.json().catch(() => ({})));
    await postSignal(session.user.id, idSchema.parse(id), to, payload, new Date());
    return ok({ sent: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
