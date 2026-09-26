"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils/cn";

type Props = {
  speciesId: string;
  name: string;
  enabled: boolean;
  /** Icon-sized switch for the species grid, or the labelled one of the sheet. */
  compact?: boolean;
  className?: string;
};

/**
 * Switches a species in or out of the egg draws (admin "Créatures" tab, spec
 * § 3.20). Owners keep a disabled species; it just never hatches again. The
 * last species of a tier cannot be switched off (the server refuses).
 */
export function SpeciesToggle({ speciesId, name, enabled, compact = false, className }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [optimistic, setOptimistic] = useState<boolean | null>(null);
  const on = optimistic ?? enabled;

  async function toggle() {
    if (pending) return;
    setPending(true);
    setError(null);
    setOptimistic(!on);
    try {
      const response = await fetch("/api/admin/species", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: speciesId, enabled: !on }) });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
        setError(body?.error?.message ?? "Enregistrement impossible.");
        setOptimistic(null);
        return;
      }
      router.refresh();
    } catch {
      setError("Impossible de joindre le serveur.");
      setOptimistic(null);
    } finally {
      setPending(false);
    }
  }

  const label = on ? "Dans les tirages" : "Désactivée";
  return (
    <div className={cn("flex flex-col items-start gap-1", compact && "items-center", className)}>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={`${name} : ${on ? "sort des œufs" : "ne sort plus des œufs"}`}
        title={on ? "Sort des œufs · toucher pour la retirer des tirages" : "Ne sort plus des œufs · toucher pour la remettre dans les tirages"}
        onClick={toggle}
        disabled={pending}
        data-species-toggle={speciesId}
        data-enabled={on ? "true" : "false"}
        className={cn(
          "inline-flex min-h-8 items-center gap-2 rounded-full border px-2 text-[11px] font-semibold transition-colors disabled:opacity-60",
          compact ? "min-h-8" : "min-h-10 px-3 text-xs",
          on ? "border-sage-400/60 bg-sage-500/15 text-sage-200 hover:bg-sage-500/25" : "border-ink-500 bg-ink-700 text-cream-500 hover:border-brass-400/60",
        )}
      >
        <span aria-hidden="true" className={cn("relative inline-block h-4 w-7 rounded-full transition-colors", on ? "bg-sage-400" : "bg-ink-500")}>
          <span className={cn("absolute top-0.5 h-3 w-3 rounded-full bg-ink-950 transition-transform", on ? "left-0.5 translate-x-3" : "left-0.5")} />
        </span>
        {label}
      </button>
      {error ? (
        <p role="alert" className="text-[11px] leading-snug text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
