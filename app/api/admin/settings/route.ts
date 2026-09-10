import { isAdminSession } from "@/lib/admin/auth";
import { fail, handleRouteError, ok } from "@/lib/api/respond";
import { optionalEnv } from "@/lib/env";
import { gameRulesPatchSchema } from "@/lib/game/rules";
import { getGameRules, getStoredRules, resetGameRules, saveGameRules } from "@/lib/game/rules-service";

export const dynamic = "force-dynamic";

/** GET /api/admin/settings → { rules, stored } */
export async function GET() {
  try {
    if (!(await isAdminSession())) return fail("unauthorized", "Connexion admin requise.", 401);
    const [rules, stored] = await Promise.all([getGameRules(), getStoredRules()]);
    return ok({ rules, stored });
  } catch (error) {
    return handleRouteError(error);
  }
}

/** PUT /api/admin/settings { patch } → replaces the overrides. */
export async function PUT(request: Request) {
  try {
    if (!(await isAdminSession())) return fail("unauthorized", "Connexion admin requise.", 401);
    const body = (await request.json().catch(() => ({}))) as { patch?: unknown; reset?: boolean };
    const admin = optionalEnv("ADMIN_USERNAME") ?? "admin";
    if (body.reset) {
      return ok({ rules: await resetGameRules(admin) });
    }
    const patch = gameRulesPatchSchema.parse(body.patch ?? {});
    return ok({ rules: await saveGameRules(patch, admin) });
  } catch (error) {
    return handleRouteError(error);
  }
}
