/**
 * The site designs a player can pick from « Plus » (and the admin enables or
 * promotes as the default): a full set of colour tokens, two typefaces and a
 * few shapes each. Pure and importable from the client (no env, no DOM):
 * `lib/themes/css.ts` turns it into the stylesheet the root layout inlines,
 * `lib/themes/service.ts` stores who chose what.
 *
 * Every token keeps its *role* across designs, whatever its lightness: `ink`
 * is always the surfaces (950 = the one text sits on when written over an
 * accent, 900 = the page, 800 = cards, 700 = chips and inputs, 600 = borders),
 * `cream` is always the text (50 = strongest, 700 = faintest), `sage` the
 * accent (300 = text and icons, 500 = a filled control read with `ink-950`),
 * `brass` the highlight (same rule). A light design therefore inverts every
 * scale: `lib/themes/themes.test.ts` checks the contrasts that matter.
 */
export const THEME_IDS = ["foret", "sable", "plage", "rose", "velours"] as const;
export type ThemeId = (typeof THEME_IDS)[number];

export const FONT_IDS = ["fraunces", "manrope", "cormorant", "jost", "josefin", "nunito", "playfair", "dmsans", "bodoni", "outfit"] as const;
export type FontId = (typeof FONT_IDS)[number];

/** CSS variable set by `next/font` in the root layout for each family, and what to fall back on. */
export const FONTS: Record<FontId, { label: string; variable: string; fallback: string }> = {
  fraunces: { label: "Fraunces", variable: "--font-fraunces", fallback: 'ui-serif, Georgia, "Times New Roman", serif' },
  manrope: { label: "Manrope", variable: "--font-manrope", fallback: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif' },
  cormorant: { label: "Cormorant Garamond", variable: "--font-cormorant", fallback: 'ui-serif, Georgia, "Times New Roman", serif' },
  jost: { label: "Jost", variable: "--font-jost", fallback: "ui-sans-serif, system-ui, sans-serif" },
  josefin: { label: "Josefin Sans", variable: "--font-josefin", fallback: "ui-sans-serif, system-ui, sans-serif" },
  nunito: { label: "Nunito Sans", variable: "--font-nunito", fallback: "ui-sans-serif, system-ui, sans-serif" },
  playfair: { label: "Playfair Display", variable: "--font-playfair", fallback: 'ui-serif, Georgia, "Times New Roman", serif' },
  dmsans: { label: "DM Sans", variable: "--font-dmsans", fallback: "ui-sans-serif, system-ui, sans-serif" },
  bodoni: { label: "Bodoni Moda", variable: "--font-bodoni", fallback: 'ui-serif, "Didot", Georgia, serif' },
  outfit: { label: "Outfit", variable: "--font-outfit", fallback: "ui-sans-serif, system-ui, sans-serif" },
};

/** The `font-family` value of a family (its `next/font` variable, then the fallbacks). */
export function fontStack(font: FontId): string {
  return `var(${FONTS[font].variable}), ${FONTS[font].fallback}`;
}

export const INK_SHADES = ["950", "900", "800", "700", "600", "500", "400"] as const;
export const SAGE_SHADES = ["100", "200", "300", "400", "500", "600", "700", "800"] as const;
export const BRASS_SHADES = ["100", "200", "300", "400", "500", "600", "700"] as const;
export const CREAM_SHADES = ["50", "100", "200", "300", "400", "500", "600", "700"] as const;
export const STATUS_COLORS = ["health", "hunger", "mood", "danger"] as const;
export const RARITY_COLOR_KEYS = ["common", "rare", "epic", "legendary"] as const;

type Scale<S extends readonly string[]> = Record<S[number], string>;

export type ThemeColors = {
  ink: Scale<typeof INK_SHADES>;
  sage: Scale<typeof SAGE_SHADES>;
  brass: Scale<typeof BRASS_SHADES>;
  cream: Scale<typeof CREAM_SHADES>;
  status: Record<(typeof STATUS_COLORS)[number], string>;
  rarity: Record<(typeof RARITY_COLOR_KEYS)[number], string>;
};

export type Theme = {
  id: ThemeId;
  name: string;
  /** One sentence, in the picker. */
  tagline: string;
  /** Drives `color-scheme` (form controls, scrollbars) and the status bar. */
  mode: "light" | "dark";
  /** `<meta name="theme-color">`: the page background. */
  themeColor: string;
  fonts: { display: FontId; sans: FontId };
  colors: ThemeColors;
  /** Card shadow and the glow behind the scene (CSS `box-shadow` values). */
  shadowCard: string;
  shadowGlow: string;
  /** The two soft glows painted behind the page (CSS colours with alpha) and the text selection colour. */
  glowTop: string;
  glowCorner: string;
  selection: string;
  /** Corner radii of the large, medium and small rounded boxes (Tailwind `rounded-3xl` / `2xl` / `xl`); omitted = the defaults. */
  radius?: { "3xl": string; "2xl": string; xl: string };
};

/** The design the app ships with: what `app/globals.css` declares (the test keeps both equal). */
export const FORET: Theme = {
  id: "foret",
  name: "Forêt",
  tagline: "Sombre et chaleureux : nuit profonde, verts sauge et laiton.",
  mode: "dark",
  themeColor: "#0b0d0b",
  fonts: { display: "fraunces", sans: "manrope" },
  colors: {
    ink: { "950": "#060806", "900": "#0b0d0b", "800": "#121612", "700": "#1a201a", "600": "#242b24", "500": "#303a30", "400": "#465246" },
    sage: { "100": "#e6ecdf", "200": "#d8e2cc", "300": "#c3d2b3", "400": "#a9bc99", "500": "#8ba07a", "600": "#6f8461", "700": "#5e7053", "800": "#3f4c38" },
    brass: { "100": "#faf0cc", "200": "#f6e4ae", "300": "#f0d68f", "400": "#e8c36a", "500": "#c9a24e", "600": "#a6823a", "700": "#7d6129" },
    cream: { "50": "#f7f4ec", "100": "#f2efe6", "200": "#e6e2d7", "300": "#d9d5c8", "400": "#b9bcb0", "500": "#9aa396", "600": "#838b80", "700": "#6f776c" },
    status: { health: "#7fb77e", hunger: "#e39b4a", mood: "#7da7d9", danger: "#d9666b" },
    rarity: { common: "#9aa396", rare: "#7da7d9", epic: "#b48ae0", legendary: "#e8c36a" },
  },
  shadowCard: "0 1px 0 rgba(255, 255, 255, 0.04) inset, 0 12px 32px rgba(0, 0, 0, 0.35)",
  shadowGlow: "0 0 60px rgba(139, 160, 122, 0.22)",
  glowTop: "rgba(139, 160, 122, 0.18)",
  glowCorner: "rgba(201, 162, 78, 0.06)",
  selection: "rgba(201, 162, 78, 0.35)",
};

/** Seashell, moon mist, rodeo dust, sand dune, Baltic sea: a warm, sandy light design. */
export const SABLE: Theme = {
  id: "sable",
  name: "Sable",
  tagline: "Beige doux, sépia et sable : la lumière d'une fin d'été.",
  mode: "light",
  themeColor: "#f3f2e7",
  fonts: { display: "cormorant", sans: "jost" },
  colors: {
    ink: { "950": "#fffefa", "900": "#f3f2e7", "800": "#faf9f3", "700": "#ede9dd", "600": "#dcd4c2", "500": "#cbb2a1", "400": "#b89f8c" },
    sage: { "100": "#3f3730", "200": "#4c433b", "300": "#5e5347", "400": "#6e6256", "500": "#726860", "600": "#9a8f84", "700": "#cbb2a1", "800": "#e3dac8" },
    brass: { "100": "#5e4630", "200": "#6e523a", "300": "#7f6045", "400": "#8b684a", "500": "#8f6d4d", "600": "#c9a88a", "700": "#e0cdb9" },
    cream: { "50": "#262625", "100": "#2e2d2b", "200": "#3a3835", "300": "#514d48", "400": "#625c55", "500": "#7e746a", "600": "#8f857a", "700": "#a0968b" },
    status: { health: "#4f8a4d", hunger: "#b3651f", mood: "#3e76b0", danger: "#b8474d" },
    rarity: { common: "#7e746a", rare: "#3d74b5", epic: "#8657c6", legendary: "#a0762b" },
  },
  shadowCard: "0 1px 0 rgba(255, 255, 255, 0.6) inset, 0 10px 28px rgba(38, 38, 37, 0.10)",
  shadowGlow: "0 0 60px rgba(126, 116, 106, 0.2)",
  glowTop: "rgba(203, 178, 161, 0.35)",
  glowCorner: "rgba(126, 116, 106, 0.12)",
  selection: "rgba(203, 178, 161, 0.5)",
};

/** Colour stories, the beach: dusty blues, pale sand and white. */
export const PLAGE: Theme = {
  id: "plage",
  name: "Plage",
  tagline: "Bleus délavés et sable clair, comme une matinée au bord de l'eau.",
  mode: "light",
  themeColor: "#edf3f4",
  fonts: { display: "josefin", sans: "nunito" },
  colors: {
    ink: { "950": "#ffffff", "900": "#edf3f4", "800": "#fdfefe", "700": "#e1ebed", "600": "#cadfe1", "500": "#afcbd0", "400": "#93b7bf" },
    sage: { "100": "#2c525d", "200": "#37626e", "300": "#427480", "400": "#59838f", "500": "#4f7985", "600": "#5f8b98", "700": "#7ba5b3", "800": "#cadfe1" },
    brass: { "100": "#6b4b2e", "200": "#7c5a3b", "300": "#8f6a48", "400": "#95704c", "500": "#916d4b", "600": "#d5b099", "700": "#e7d6c6" },
    cream: { "50": "#1e3138", "100": "#27414a", "200": "#33505a", "300": "#44626d", "400": "#557481", "500": "#66838f", "600": "#7a97a3", "700": "#7f9eaa" },
    status: { health: "#4c8c55", hunger: "#b8691f", mood: "#3d7fb5", danger: "#c2484f" },
    rarity: { common: "#66838f", rare: "#3d74b5", epic: "#8657c6", legendary: "#a0762b" },
  },
  shadowCard: "0 1px 0 rgba(255, 255, 255, 0.7) inset, 0 10px 28px rgba(30, 49, 56, 0.10)",
  shadowGlow: "0 0 60px rgba(123, 165, 179, 0.25)",
  glowTop: "rgba(123, 165, 179, 0.30)",
  glowCorner: "rgba(213, 176, 153, 0.28)",
  selection: "rgba(123, 165, 179, 0.4)",
};

/** Ivory with a blush, old rose and champagne gold. */
export const ROSE: Theme = {
  id: "rose",
  name: "Rose poudré",
  tagline: "Ivoire rosé, vieux rose et or champagne : doux et précieux.",
  mode: "light",
  themeColor: "#faf3f1",
  fonts: { display: "playfair", sans: "dmsans" },
  colors: {
    ink: { "950": "#ffffff", "900": "#faf3f1", "800": "#fffbfa", "700": "#f3e6e3", "600": "#e8d3cf", "500": "#d9bbb7", "400": "#c9a3a0" },
    sage: { "100": "#7a3f47", "200": "#8b4a53", "300": "#9c5660", "400": "#b06b75", "500": "#a45c67", "600": "#b5737b", "700": "#c98b8f", "800": "#f2d9d6" },
    brass: { "100": "#6e4e2c", "200": "#7e5a34", "300": "#8f6a3f", "400": "#94703f", "500": "#957043", "600": "#d2b48c", "700": "#ead9bf" },
    cream: { "50": "#33232b", "100": "#3d2c35", "200": "#4a3841", "300": "#5e4a54", "400": "#705c66", "500": "#85707a", "600": "#99848e", "700": "#a8949d" },
    status: { health: "#4c8c55", hunger: "#b8691f", mood: "#5d74c7", danger: "#c2484f" },
    rarity: { common: "#85707a", rare: "#4d6fc5", epic: "#8657c6", legendary: "#a0762b" },
  },
  shadowCard: "0 1px 0 rgba(255, 255, 255, 0.7) inset, 0 10px 28px rgba(59, 42, 50, 0.10)",
  shadowGlow: "0 0 60px rgba(201, 139, 143, 0.25)",
  glowTop: "rgba(242, 217, 214, 0.7)",
  glowCorner: "rgba(210, 180, 140, 0.25)",
  selection: "rgba(201, 139, 143, 0.35)",
};

/** Deep black with a plum undertone, ivory and gold: a jewellery box. */
export const VELOURS: Theme = {
  id: "velours",
  name: "Velours noir",
  tagline: "Noir profond, ivoire et or : l'élégance d'un écrin.",
  mode: "dark",
  themeColor: "#0e0c11",
  fonts: { display: "bodoni", sans: "outfit" },
  colors: {
    ink: { "950": "#08070a", "900": "#0e0c11", "800": "#151219", "700": "#1e1a24", "600": "#2a2531", "500": "#37313f", "400": "#4a4354" },
    sage: { "100": "#f3e4ea", "200": "#e9d2db", "300": "#d9b8c5", "400": "#c9a0b0", "500": "#b48598", "600": "#96697c", "700": "#6e4c5c", "800": "#4a3340" },
    brass: { "100": "#fbecc4", "200": "#f4dfa6", "300": "#e9cf86", "400": "#d9b95e", "500": "#c5a24a", "600": "#9f8038", "700": "#75602a" },
    cream: { "50": "#f7f1e8", "100": "#f1eae0", "200": "#e5ddd2", "300": "#d3cabe", "400": "#b5ada2", "500": "#9d958b", "600": "#857d74", "700": "#6e675f" },
    status: { health: "#8fcb8c", hunger: "#e5a455", mood: "#92b4e3", danger: "#e07178" },
    rarity: { common: "#9d958b", rare: "#92b4e3", epic: "#c39cea", legendary: "#d9b95e" },
  },
  shadowCard: "0 1px 0 rgba(255, 255, 255, 0.05) inset, 0 14px 36px rgba(0, 0, 0, 0.5)",
  shadowGlow: "0 0 60px rgba(217, 185, 94, 0.18)",
  glowTop: "rgba(217, 185, 94, 0.10)",
  glowCorner: "rgba(180, 133, 152, 0.10)",
  selection: "rgba(217, 185, 94, 0.35)",
  radius: { "3xl": "1rem", "2xl": "0.75rem", xl: "0.5rem" },
};

export const THEMES: readonly Theme[] = [FORET, SABLE, PLAGE, ROSE, VELOURS];
export const THEME_BY_ID: Record<ThemeId, Theme> = { foret: FORET, sable: SABLE, plage: PLAGE, rose: ROSE, velours: VELOURS };

/** The design used when nobody chose anything and the admin promoted none. */
export const BUILTIN_DEFAULT_THEME: ThemeId = "foret";

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === "string" && (THEME_IDS as readonly string[]).includes(value);
}

/** What the admin decided: the design served by default and the ones players may no longer pick. */
export type ThemeSettings = { defaultId: ThemeId; disabled: ReadonlySet<ThemeId> };

export const DEFAULT_THEME_SETTINGS: ThemeSettings = { defaultId: BUILTIN_DEFAULT_THEME, disabled: new Set() };

/**
 * The design to render for a preference (the player's stored choice or the
 * device cookie): honoured when it names a design the admin left enabled,
 * otherwise the admin's default (which is never disabled).
 */
export function resolveTheme(preference: string | null | undefined, settings: ThemeSettings = DEFAULT_THEME_SETTINGS): Theme {
  if (isThemeId(preference) && !settings.disabled.has(preference)) return THEME_BY_ID[preference];
  return THEME_BY_ID[settings.defaultId];
}

/** The designs a player may pick: every enabled one, the default first, in catalogue order. */
export function selectableThemes(settings: ThemeSettings = DEFAULT_THEME_SETTINGS): Theme[] {
  return THEMES.filter((theme) => !settings.disabled.has(theme.id) || theme.id === settings.defaultId);
}

/** A handful of the theme's colours for a preview card: page, card, text, accent, highlight. */
export function themeSwatches(theme: Theme): { page: string; card: string; text: string; accent: string; highlight: string } {
  return { page: theme.colors.ink["900"], card: theme.colors.ink["800"], text: theme.colors.cream["50"], accent: theme.colors.sage["500"], highlight: theme.colors.brass["400"] };
}
