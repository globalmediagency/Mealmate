import { isAdminSession } from "@/lib/admin/auth";
import { fail, handleRouteError, ok } from "@/lib/api/respond";
import { getTurnIceServers, isTurnConfigured } from "@/lib/arena/turn";
import { ARENA } from "@/lib/game/config";
import { getGameRules } from "@/lib/game/rules-service";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/turn → the relay as the server sees it, for the admin's
 * network diagnostic: variables present, a fresh answer from Cloudflare (with
 * the credentials, so the admin's browser can try the relay) and the rule.
 */
export async function GET() {
  try {
    if (!(await isAdminSession())) return fail("unauthorized", "Connexion admin requise.", 401);
    const rules = await getGameRules();
    const configured = isTurnConfigured();
    const started = Date.now();
    const servers = configured ? await getTurnIceServers({ fresh: true }) : null;
    return ok(
      { configured, ok: servers !== null, servers: servers ?? [], fetchMs: Date.now() - started, stun: ARENA.rtc.iceServers, webrtc: rules.arena.webrtc },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
