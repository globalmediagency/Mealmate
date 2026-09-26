import { cookies } from "next/headers";
import { cache } from "react";
import { resolveTheme, type Theme } from "./catalog";
import { THEME_COOKIE } from "./cookie";
import { getThemeSettings } from "./service";

/**
 * The design to render for this request (root layout, viewport): the device
 * cookie when it names a design the admin left enabled, else the admin's
 * default. Server only. Memoised per request.
 */
export const currentTheme = cache(async (): Promise<Theme> => {
  const jar = await cookies();
  return resolveTheme(jar.get(THEME_COOKIE)?.value, await getThemeSettings());
});
