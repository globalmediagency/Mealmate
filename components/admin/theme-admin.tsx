"use client";

import { Star } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ThemePreview } from "@/components/theme/theme-preview";
import { Alert } from "@/components/ui/alert";
import { FONTS, type Theme, type ThemeId } from "@/lib/themes/catalog";
import { cn } from "@/lib/utils/cn";

type Props = {
  themes: readonly Theme[];
  defaultId: ThemeId;
  disabled: ThemeId[];
  /** Players who chose each design explicitly. */
  choices: Partial<Record<ThemeId, number>>;
};

/**
 * Admin « Apparence » (spec § 3.27): every design with its miniature, a
 * switch to offer it or not in « Plus », and a button to make it the default
 * served to players who chose nothing. The default cannot be switched off.
 */
export function ThemeAdmin({ themes, defaultId, disabled, choices }: Props) {
  const router = useRouter();
  const [state, setState] = useState({ defaultId, disabled: new Set(disabled) });
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);

  async function send(id: ThemeId, patch: { enabled?: boolean; default?: true }, success: string) {
    setPending(id);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/themes", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...patch }) });
      const body = (await response.json().catch(() => null)) as { default?: ThemeId; disabled?: ThemeId[]; error?: { message?: string } } | null;
      if (!response.ok || !body?.default) {
        setMessage({ tone: "danger", text: body?.error?.message ?? "Enregistrement impossible." });
        return;
      }
      setState({ defaultId: body.default, disabled: new Set(body.disabled ?? []) });
      setMessage({ tone: "success", text: success });
      router.refresh();
    } catch {
      setMessage({ tone: "danger", text: "Impossible de joindre le serveur." });
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="space-y-4" data-theme-admin data-default={state.defaultId}>
      {message ? <Alert tone={message.tone}>{message.text}</Alert> : null}
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {themes.map((theme) => {
          const isDefault = theme.id === state.defaultId;
          const enabled = !state.disabled.has(theme.id);
          const chosen = choices[theme.id] ?? 0;
          return (
            <li key={theme.id} className={cn("flex flex-col gap-3 rounded-3xl border bg-ink-800/80 p-3", isDefault ? "border-brass-400/60" : enabled ? "border-ink-600/80" : "border-dashed border-ink-600/80")} data-theme-row={theme.id} data-enabled={enabled ? "true" : "false"}>
              <ThemePreview theme={theme} className={enabled ? undefined : "opacity-50"} />
              <div className="flex items-start gap-3 px-1">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-1.5 text-base font-semibold text-cream-50">
                    {theme.name}
                    {isDefault ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-brass-400/60 bg-brass-500/15 px-2 py-0.5 text-[10px] font-semibold text-brass-200">
                        <Star className="h-3 w-3" aria-hidden="true" /> par défaut
                      </span>
                    ) : null}
                    {!enabled ? <span className="rounded-full border border-ink-500 bg-ink-700 px-2 py-0.5 text-[10px] font-semibold text-cream-500">désactivé</span> : null}
                  </p>
                  <p className="text-xs text-cream-500">{theme.tagline}</p>
                  <p className="mt-1 text-[11px] text-cream-700">
                    {theme.mode === "dark" ? "Sombre" : "Clair"} · {FONTS[theme.fonts.display].label} + {FONTS[theme.fonts.sans].label} · choisi par {chosen} joueur{chosen > 1 ? "s" : ""}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 px-1">
                <button
                  type="button"
                  role="switch"
                  aria-checked={enabled}
                  aria-label={`${theme.name} : ${enabled ? "proposé aux joueurs" : "retiré du choix"}`}
                  title={isDefault ? "Le design par défaut reste toujours proposé." : enabled ? "Toucher pour le retirer du choix des joueurs" : "Toucher pour le proposer à nouveau"}
                  onClick={() => send(theme.id, { enabled: !enabled }, enabled ? `${theme.name} n'est plus proposé ; les joueurs qui l'avaient reviennent au design par défaut.` : `${theme.name} est de nouveau proposé.`)}
                  disabled={pending !== null || isDefault}
                  data-theme-toggle={theme.id}
                  className={cn(
                    "inline-flex min-h-10 items-center gap-2 rounded-full border px-3 text-xs font-semibold transition-colors disabled:opacity-60",
                    enabled ? "border-sage-400/60 bg-sage-500/15 text-sage-200 hover:bg-sage-500/25" : "border-ink-500 bg-ink-700 text-cream-500 hover:border-brass-400/60",
                  )}
                >
                  <span aria-hidden="true" className={cn("relative inline-block h-4 w-7 rounded-full transition-colors", enabled ? "bg-sage-400" : "bg-ink-500")}>
                    <span className={cn("absolute top-0.5 h-3 w-3 rounded-full bg-ink-950 transition-transform", enabled ? "left-0.5 translate-x-3" : "left-0.5")} />
                  </span>
                  {enabled ? "Proposé" : "Désactivé"}
                </button>
                {!isDefault ? (
                  <button
                    type="button"
                    onClick={() => send(theme.id, { default: true }, `${theme.name} est maintenant le design par défaut.`)}
                    disabled={pending !== null}
                    data-theme-make-default={theme.id}
                    className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-brass-400/60 bg-brass-500/10 px-3 text-xs font-semibold text-brass-200 hover:bg-brass-500/20 disabled:opacity-60"
                  >
                    <Star className="h-3.5 w-3.5" aria-hidden="true" />
                    Définir par défaut
                  </button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
