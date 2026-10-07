import { z } from "zod";
import { isAdminSession } from "@/lib/admin/auth";
import { fail, handleRouteError, ok } from "@/lib/api/respond";
import { optionalEnv } from "@/lib/env";
import { countThemeChoices, getStoredThemeSettings, updateThemeSettings } from "@/lib/themes/service";

export const dynamic = "force-dynamic";

const patchSchema = z
  .object({
    id: z.string().min(1).max(40),
    enabled: z.boolean().optional(),
    default: z.literal(true).optional(),
  })
  .refine((p) => p.enabled !== undefined || p.default === true, { message: "Rien à changer." });

const view = (settings: { defaultId: string; disabled: ReadonlySet<string> }) => ({ default: settings.defaultId, disabled: [...settings.disabled].sort() });

/** GET /api/admin/themes → the default design, the disabled ones and how many players chose each. */
export async function GET() {
  try {
    if (!(await isAdminSession())) return fail("unauthorized", "Connexion admin requise.", 401);
    const [stored, choices] = await Promise.all([getStoredThemeSettings(), countThemeChoices()]);
    return ok({ ...view(stored), choices, updatedAt: stored.updatedAt?.toISOString() ?? null, updatedBy: stored.updatedBy });
  } catch (error) {
    return handleRouteError(error);
  }
}

/** PUT /api/admin/themes { id, enabled? , default? } → switches a design in or out of the picker, or makes it the default. */
export async function PUT(request: Request) {
  try {
    if (!(await isAdminSession())) return fail("unauthorized", "Connexion admin requise.", 401);
    const body = patchSchema.parse(await request.json().catch(() => ({})));
    const admin = optionalEnv("ADMIN_USERNAME") ?? "admin";
    const settings = await updateThemeSettings(body, admin);
    return ok(view(settings));
  } catch (error) {
    return handleRouteError(error);
  }
}
