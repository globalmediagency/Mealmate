/** The device's design, mirrored from the account (`profiles.theme`) so every page, signed in or not, renders it server-side. */
export const THEME_COOKIE = "mm_theme";

/** One year; readable by the page (`ThemeSync` rewrites it when the account says otherwise). */
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export const themeCookieOptions = { path: "/", maxAge: THEME_COOKIE_MAX_AGE, sameSite: "lax" as const, httpOnly: false };
