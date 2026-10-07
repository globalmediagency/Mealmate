import { BRASS_SHADES, CREAM_SHADES, FORET, fontStack, INK_SHADES, RARITY_COLOR_KEYS, SAGE_SHADES, STATUS_COLORS, THEMES, type Theme } from "./catalog";

/**
 * The CSS custom properties one design sets, as `name: value` pairs. The
 * names are the ones `app/globals.css` declares in its `@theme` block (so
 * every Tailwind utility follows), plus the few page-level ones (`--mm-*`).
 */
export function themeVariables(theme: Theme): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const shade of INK_SHADES) vars[`--color-ink-${shade}`] = theme.colors.ink[shade];
  for (const shade of SAGE_SHADES) vars[`--color-sage-${shade}`] = theme.colors.sage[shade];
  for (const shade of BRASS_SHADES) vars[`--color-brass-${shade}`] = theme.colors.brass[shade];
  for (const shade of CREAM_SHADES) vars[`--color-cream-${shade}`] = theme.colors.cream[shade];
  for (const key of STATUS_COLORS) vars[`--color-${key}`] = theme.colors.status[key];
  for (const key of RARITY_COLOR_KEYS) vars[`--color-rarity-${key}`] = theme.colors.rarity[key];
  vars["--font-display"] = fontStack(theme.fonts.display);
  vars["--font-sans"] = fontStack(theme.fonts.sans);
  vars["--shadow-card"] = theme.shadowCard;
  vars["--shadow-glow"] = theme.shadowGlow;
  vars["--mm-glow-top"] = theme.glowTop;
  vars["--mm-glow-corner"] = theme.glowCorner;
  vars["--mm-selection"] = theme.selection;
  const radius = theme.radius ?? FORET.radius ?? { "3xl": "1.5rem", "2xl": "1rem", xl: "0.75rem" };
  vars["--radius-3xl"] = radius["3xl"];
  vars["--radius-2xl"] = radius["2xl"];
  vars["--radius-xl"] = radius.xl;
  return vars;
}

/** One rule per design, on `html[data-theme="…"]`: unlayered, so it wins over Tailwind's `:root` values. */
export function themesCss(themes: readonly Theme[] = THEMES): string {
  return themes
    .map((theme) => {
      const lines = Object.entries(themeVariables(theme)).map(([name, value]) => `${name}:${value};`);
      lines.push(`color-scheme:${theme.mode};`);
      return `html[data-theme="${theme.id}"]{${lines.join("")}}`;
    })
    .join("\n");
}
