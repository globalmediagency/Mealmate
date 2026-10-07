import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BRASS_SHADES, CREAM_SHADES, DEFAULT_THEME_SETTINGS, FORET, INK_SHADES, resolveTheme, SAGE_SHADES, selectableThemes, THEME_IDS, THEMES, themeSwatches, type Theme } from "./catalog";
import { contrastRatio } from "./contrast";
import { themesCss, themeVariables } from "./css";

const HEX = /^#[0-9a-f]{6}$/;

/** The pairs every design must keep readable, with the WCAG ratio expected (4.5 = AA text, 3 = large text and icons). */
function expectations(t: Theme): Array<[string, string, number, string]> {
  const { ink, cream, sage, brass, status, rarity } = t.colors;
  const pairs: Array<[string, string, number, string]> = [];
  for (const shade of ["950", "900", "800", "700"] as const) {
    pairs.push([cream["50"], ink[shade], 4.5, `cream-50 on ink-${shade}`]);
    pairs.push([cream["100"], ink[shade], 4.5, `cream-100 on ink-${shade}`]);
    pairs.push([cream["300"], ink[shade], 4.5, `cream-300 on ink-${shade}`]);
  }
  pairs.push([cream["500"], ink["800"], 3.5, "cream-500 on ink-800"], [cream["500"], ink["900"], 3.5, "cream-500 on ink-900"]);
  pairs.push([cream["700"], ink["800"], 2.5, "cream-700 on ink-800"]);
  pairs.push([sage["300"], ink["800"], 4, "sage-300 on ink-800"], [sage["300"], ink["900"], 4, "sage-300 on ink-900"], [sage["200"], ink["800"], 4.5, "sage-200 on ink-800"], [sage["400"], ink["900"], 3, "sage-400 on ink-900"]);
  pairs.push([brass["300"], ink["800"], 4, "brass-300 on ink-800"], [brass["300"], ink["900"], 4, "brass-300 on ink-900"], [brass["200"], ink["800"], 4.5, "brass-200 on ink-800"]);
  pairs.push([ink["950"], sage["500"], 4, "ink-950 on sage-500"], [ink["950"], sage["400"], 3, "ink-950 on sage-400"], [ink["950"], sage["600"], 3, "ink-950 on sage-600"]);
  pairs.push([ink["950"], brass["500"], 4, "ink-950 on brass-500"], [ink["950"], brass["400"], 4, "ink-950 on brass-400"], [ink["950"], brass["300"], 3, "ink-950 on brass-300"]);
  pairs.push([ink["950"], status.health, 3, "ink-950 on health"]);
  for (const key of ["health", "hunger", "mood"] as const) pairs.push([status[key], ink["800"], 3, `${key} on ink-800`]);
  pairs.push([status.danger, ink["800"], 4, "danger on ink-800"]);
  for (const key of ["common", "rare", "epic", "legendary"] as const) pairs.push([rarity[key], ink["800"], 3, `rarity-${key} on ink-800`]);
  return pairs;
}

describe("theme catalogue", () => {
  it("defines every token of every design as a hex colour, with distinct ids", () => {
    expect(new Set(THEMES.map((t) => t.id)).size).toBe(THEMES.length);
    expect(THEMES.map((t) => t.id)).toEqual([...THEME_IDS]);
    for (const t of THEMES) {
      for (const shade of INK_SHADES) expect(t.colors.ink[shade]).toMatch(HEX);
      for (const shade of SAGE_SHADES) expect(t.colors.sage[shade]).toMatch(HEX);
      for (const shade of BRASS_SHADES) expect(t.colors.brass[shade]).toMatch(HEX);
      for (const shade of CREAM_SHADES) expect(t.colors.cream[shade]).toMatch(HEX);
      for (const value of Object.values(t.colors.status)) expect(value).toMatch(HEX);
      for (const value of Object.values(t.colors.rarity)) expect(value).toMatch(HEX);
      expect(t.themeColor).toMatch(HEX);
      expect(t.name.length).toBeGreaterThan(1);
      expect(t.tagline.length).toBeGreaterThan(10);
    }
  });

  it("keeps the pairs the interface relies on readable, light or dark", () => {
    const failures: string[] = [];
    for (const t of THEMES) {
      for (const [fg, bg, min, label] of expectations(t)) {
        const ratio = contrastRatio(fg, bg);
        if (ratio < min) failures.push(`${t.id}: ${label} = ${ratio.toFixed(2)} < ${min}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it("orders the surfaces and the text consistently with the design's mode", () => {
    for (const t of THEMES) {
      const page = contrastRatio(t.colors.ink["900"], "#000000");
      const text = contrastRatio(t.colors.cream["50"], "#000000");
      // Dark mode: dark page, light text. Light mode: the reverse.
      expect(t.mode === "dark" ? page < text : page > text).toBe(true);
      expect(themeSwatches(t).page).toBe(t.colors.ink["900"]);
    }
  });

  it("matches the base stylesheet: globals.css declares exactly the Forêt values", () => {
    const css = readFileSync(path.resolve(process.cwd(), "app/globals.css"), "utf8");
    const declared = new Map<string, string>();
    for (const m of css.matchAll(/^\s*(--(?:color|font|shadow)-[a-z0-9-]+):\s*([^;]+);/gm)) declared.set(m[1], m[2].trim());
    const expected = themeVariables(FORET);
    for (const [name, value] of Object.entries(expected)) {
      if (name.startsWith("--mm-") || name.startsWith("--radius-")) continue;
      expect(declared.get(name), name).toBe(value);
    }
    expect(css).toContain("var(--mm-glow-top)");
    expect(css).toContain("var(--mm-selection)");
  });

  it("generates one unlayered rule per design, with its colour scheme and fonts", () => {
    const css = themesCss();
    for (const t of THEMES) {
      expect(css).toContain(`html[data-theme="${t.id}"]{`);
      expect(css).toContain(`--color-ink-900:${t.colors.ink["900"]};`);
      expect(css).toContain(`color-scheme:${t.mode};`);
    }
    expect(css).toContain("--font-display:var(--font-cormorant)");
    expect(css).toContain("--radius-3xl:1rem;");
  });

  it("resolves a preference to an enabled design and falls back to the admin default", () => {
    expect(resolveTheme("plage").id).toBe("plage");
    expect(resolveTheme("nope").id).toBe("foret");
    expect(resolveTheme(null).id).toBe("foret");
    const settings = { defaultId: "sable" as const, disabled: new Set(["plage" as const]) };
    expect(resolveTheme("plage", settings).id).toBe("sable");
    expect(resolveTheme(undefined, settings).id).toBe("sable");
    expect(resolveTheme("velours", settings).id).toBe("velours");
    expect(selectableThemes(settings).map((t) => t.id)).toEqual(["foret", "sable", "rose", "velours"]);
    expect(selectableThemes(DEFAULT_THEME_SETTINGS)).toHaveLength(THEMES.length);
  });
});
