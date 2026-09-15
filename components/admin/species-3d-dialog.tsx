"use client";

import { Box, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Creature3dView } from "@/components/ar/three/creature-3d-view";
import { getSpecies } from "@/lib/creatures";
import { STAGES, type StageId } from "@/lib/game/config";
import type { CreatureState } from "@/lib/game/creature-view";
import { cn } from "@/lib/utils/cn";

const STATES: { id: CreatureState; label: string }[] = [
  { id: "healthy", label: "En forme" },
  { id: "tired", label: "Fatiguée" },
  { id: "sick", label: "Malade" },
  { id: "dead", label: "Morte" },
];

type Props = {
  speciesId: string;
  /** Icon-only corner button (species grid) or a labelled one (species sheet). */
  compact?: boolean;
  className?: string;
};

/** One click opens the species in 3D (admin "Créatures" tab, spec § 3.20), turnable by hand, at any stage and state. */
export function Species3dButton({ speciesId, compact = false, className }: Props) {
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<StageId>("adulte");
  const [state, setState] = useState<CreatureState>("healthy");
  const closeButton = useRef<HTMLButtonElement>(null);
  const species = getSpecies(speciesId);

  useEffect(() => {
    if (!open) return;
    closeButton.current?.focus();
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (!species) return null;
  const title = `${species.name} en 3D`;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={compact ? title : undefined}
        title={compact ? title : undefined}
        className={cn(
          "inline-flex items-center justify-center gap-1 rounded-xl border border-ink-600 bg-ink-900/80 text-xs font-semibold text-cream-200 transition-colors hover:border-sage-500/60 hover:text-cream-50",
          compact ? "h-11 w-11" : "min-h-10 px-3",
          className,
        )}
      >
        <Box className="h-4 w-4" aria-hidden="true" />
        {compact ? null : "Voir en 3D"}
      </button>
      {open
        ? createPortal(
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/80 p-4 backdrop-blur-sm" onClick={() => setOpen(false)}>
              <section
                role="dialog"
                aria-modal="true"
                aria-label={title}
                className="w-full max-w-md space-y-3 rounded-3xl border border-ink-600/80 bg-ink-800 p-4 shadow-card animate-rise"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex items-center gap-2">
                  <h2 className="font-display text-2xl text-cream-50">{species.name}</h2>
                  <code className="text-xs text-cream-700">{species.id}</code>
                  <button
                    ref={closeButton}
                    type="button"
                    onClick={() => setOpen(false)}
                    aria-label="Fermer"
                    className="-mr-2 ml-auto inline-flex h-11 w-11 items-center justify-center rounded-xl text-cream-300 hover:bg-ink-700 hover:text-cream-50"
                  >
                    <X className="h-5 w-5" aria-hidden="true" />
                  </button>
                </div>
                <Creature3dView speciesId={species.id} stage={stage} state={state} />
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Stade">
                  {STAGES.map((s) => (
                    <Chip key={s.id} active={stage === s.id} onClick={() => setStage(s.id)}>
                      {s.label}
                    </Chip>
                  ))}
                </div>
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="État">
                  {STATES.map((s) => (
                    <Chip key={s.id} active={state === s.id} onClick={() => setState(s.id)}>
                      {s.label}
                    </Chip>
                  ))}
                </div>
              </section>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex min-h-10 items-center rounded-full border px-3 text-xs font-semibold transition-colors",
        active ? "border-sage-400/70 bg-sage-500/15 text-sage-200" : "border-ink-600 bg-ink-800 text-cream-300 hover:border-ink-400",
      )}
    >
      {children}
    </button>
  );
}
