"use client";

import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { FONTS, fontStack, type Theme, type ThemeId } from "@/lib/themes/catalog";
import { cn } from "@/lib/utils/cn";
import { ThemePreview } from "./theme-preview";
import { applyTheme } from "./theme-sync";

type Props = {
  /** The designs the admin left enabled, in catalogue order. */
  themes: Theme[];
  /** The admin's default (followed by players who chose nothing). */
  defaultId: ThemeId;
  /** The player's explicit choice, null when they follow the default. */
  chosen: ThemeId | null;
  /** Demo pages: switch the page, call no API. */
  preview?: boolean;
};

/**
 * « Plus » → Apparence: the designs as cards (their own colours and
 * typefaces), the current one ticked. A tap switches the page at once, then
 * stores the choice on the account and the device (`PUT /api/account/theme`).
 */
export function ThemePicker({ themes, defaultId, chosen, preview = false }: Props) {
  const router = useRouter();
  const [choice, setChoice] = useState<ThemeId | null>(chosen);
  const [pending, setPending] = useState<ThemeId | "default" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const current = choice ?? defaultId;

  async function select(theme: ThemeId | null) {
    const before = choice;
    const shown = theme ?? defaultId;
    setChoice(theme);
    setError(null);
    applyTheme(shown);
    if (preview) return;
    setPending(theme ?? "default");
    try {
      const response = await fetch("/api/account/theme", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ theme }) });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
        setError(body?.error?.message ?? "Enregistrement impossible.");
        setChoice(before);
        applyTheme(before ?? defaultId);
        return;
      }
      router.refresh();
    } catch {
      setError("Impossible de joindre le serveur.");
      setChoice(before);
      applyTheme(before ?? defaultId);
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="space-y-3" data-theme-picker data-theme-current={current}>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <div role="radiogroup" aria-label="Design du site" className="grid grid-cols-2 gap-3">
        {themes.map((theme) => {
          const active = theme.id === current;
          return (
            <button
              key={theme.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => select(theme.id)}
              disabled={pending !== null}
              data-theme-option={theme.id}
              className={cn(
                "flex flex-col gap-2 rounded-3xl border p-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass-400/70 disabled:opacity-70",
                active ? "border-sage-400 bg-sage-500/10" : "border-ink-600/80 bg-ink-800/70 hover:border-sage-500/50",
              )}
            >
              <ThemePreview theme={theme} />
              <span className="flex items-start gap-2 px-1 pb-1">
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-sm font-semibold text-cream-50" style={{ fontFamily: fontStack(theme.fonts.display) }}>
                    {theme.name}
                    {theme.id === defaultId ? <span className="rounded-full border border-ink-500 bg-ink-700 px-1.5 py-0.5 text-[10px] font-semibold text-cream-500" style={{ fontFamily: "var(--font-sans)" }}>par défaut</span> : null}
                  </span>
                  <span className="mt-0.5 block text-xs leading-snug text-cream-500">{theme.tagline}</span>
                  <span className="mt-1 block text-[10px] text-cream-700">
                    {FONTS[theme.fonts.display].label} · {FONTS[theme.fonts.sans].label}
                  </span>
                </span>
                <span className={cn("mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border", active ? "border-sage-400 bg-sage-500 text-ink-950" : "border-ink-500 text-transparent")} aria-hidden="true">
                  <Check className="h-3.5 w-3.5" />
                </span>
              </span>
            </button>
          );
        })}
      </div>
      {choice !== null ? (
        <p className="text-xs text-cream-500">
          Tu as choisi ce design toi-même.{" "}
          <button type="button" onClick={() => select(null)} disabled={pending !== null} className="min-h-8 font-semibold text-sage-300 underline underline-offset-2" data-theme-follow-default>
            Suivre le design par défaut de MealMate
          </button>
        </p>
      ) : (
        <p className="text-xs text-cream-500">Tu suis le design par défaut de MealMate : touche une carte pour en garder un à toi.</p>
      )}
    </div>
  );
}
