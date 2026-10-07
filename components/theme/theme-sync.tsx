"use client";

import { useEffect } from "react";
import type { ThemeId } from "@/lib/themes/catalog";
import { THEME_COOKIE, THEME_COOKIE_MAX_AGE } from "@/lib/themes/cookie";

/** Applies a design to the page at once and remembers it on the device (cookie the root layout reads on the next request). */
export function applyTheme(theme: ThemeId): void {
  document.documentElement.dataset.theme = theme;
  document.cookie = `${THEME_COOKIE}=${theme}; path=/; max-age=${THEME_COOKIE_MAX_AGE}; samesite=lax`;
}

/**
 * The account's design wins over the device's: when the signed-in player's
 * resolved design differs from what the root layout rendered from the cookie
 * (another account on this phone, a choice made elsewhere, a default changed
 * by the admin), the page switches and the cookie follows.
 */
export function ThemeSync({ theme }: { theme: ThemeId }) {
  useEffect(() => {
    if (document.documentElement.dataset.theme !== theme) applyTheme(theme);
  }, [theme]);
  return null;
}
