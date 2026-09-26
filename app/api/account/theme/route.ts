import { z } from "zod";
import { fail, handleRouteError, ok } from "@/lib/api/respond";
import { getSession } from "@/lib/auth/session";
import { THEME_IDS } from "@/lib/themes/catalog";
import { THEME_COOKIE, themeCookieOptions } from "@/lib/themes/cookie";
import { getThemeSettings, setUserTheme } from "@/lib/themes/service";
import { resolveTheme } from "@/lib/themes/catalog";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  /** A design id, or null to follow the admin's default. */
  theme: z.enum(THEME_IDS).nullable(),
});

/** PUT /api/account/theme { theme } → stores the player's design and mirrors it in the device cookie. */
export async function PUT(request: Request) {
  try {
    const session = await getSession();
    if (!session) return fail("unauthorized", "Connecte-toi pour continuer.", 401);
    const body = bodySchema.parse(await request.json().catch(() => ({})));
    const theme = await setUserTheme(session.user.id, body.theme);
    const rendered = resolveTheme(theme, await getThemeSettings());
    const response = ok({ theme, rendered: rendered.id });
    response.cookies.set(THEME_COOKIE, rendered.id, themeCookieOptions);
    return response;
  } catch (error) {
    return handleRouteError(error);
  }
}
