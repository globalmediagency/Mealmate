"use client";

import { RotateCw } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Creature, type EquippedAccessory } from "@/components/creatures/creature";
import { getSpecies } from "@/lib/creatures";
import type { StageId } from "@/lib/game/config";
import type { CreatureState } from "@/lib/game/creature-view";
import { cn } from "@/lib/utils/cn";
import { AccessorySprites, accessoryMarkup } from "./accessory-sprites";
import type { Turntable } from "./turntable";

type TurntableModule = typeof import("./turntable");

export type Creature3dViewProps = {
  speciesId: string;
  stage?: StageId;
  state?: CreatureState;
  accessories?: EquippedAccessory[];
  /** Start turning by itself (a drag stops it; the button restarts it). */
  autoRotate?: boolean;
  /** Starting angle of the orbit, in degrees (0 = face, positive = the face slides to the viewer's left, like `Creature`'s `yaw`). */
  yaw?: number;
  className?: string;
};

/** Drag sensitivity (radians per CSS pixel). */
const DRAG_YAW = 0.012;
const DRAG_PITCH = 0.008;
const KEY_STEP = 0.25;

/**
 * The creature in 3D, alone, turned by hand (spec § 3.20): the same volumes as
 * "Voir en vrai". Without WebGL, the flat drawing is shown instead.
 */
export function Creature3dView({ speciesId, stage = "adulte", state = "healthy", accessories = [], autoRotate = true, yaw, className }: Creature3dViewProps) {
  const [status, setStatus] = useState<"loading" | "ready" | "unsupported">("loading");
  const [spinning, setSpinning] = useState(autoRotate);
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const sprites = useRef<HTMLDivElement>(null);
  const table = useRef<Turntable | null>(null);
  const three = useRef<TurntableModule | null>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const latest = useRef({ speciesId, stage, state, accessories });
  latest.current = { speciesId, stage, state, accessories };
  const species = getSpecies(speciesId);
  const accessoryKey = accessories.map((a) => `${a.slot}:${a.id}`).join(",");

  function apply() {
    const t = table.current;
    const loaded = three.current;
    const current = getSpecies(latest.current.speciesId);
    if (!t || !loaded || !current) return;
    t.setCreature({
      species: current,
      stage: latest.current.stage,
      state: latest.current.state,
      accessories: latest.current.accessories,
      textures: (id, layer) => {
        const markup = accessoryMarkup(sprites.current, current.id, id, layer);
        return markup ? loaded.textureFromSvg(markup) : Promise.resolve(null);
      },
      markup: (id, layer) => accessoryMarkup(sprites.current, current.id, id, layer),
    });
  }

  useEffect(() => {
    let cancelled = false;
    let observer: ResizeObserver | null = null;
    import("./turntable")
      .then((loaded) => {
        const el = box.current;
        const c = canvas.current;
        if (cancelled || !el || !c) return;
        try {
          const t = new loaded.Turntable(c, el.clientWidth, el.clientHeight);
          t.autoRotate = autoRotate;
          if (yaw !== undefined) t.yaw = (yaw * Math.PI) / 180;
          // The dev gallery's probes (`/dev/screens?screen=creature-3d`) inspect the scene through this handle.
          if (process.env.NEXT_PUBLIC_DEV_GALLERY === "true") (window as Window & { __turntable?: Turntable }).__turntable = t;
          three.current = loaded;
          table.current = t;
          apply();
          t.start();
          observer = new ResizeObserver(() => t.resize(el.clientWidth, el.clientHeight));
          observer.observe(el);
          setStatus("ready");
        } catch (error) {
          console.warn("[3d] WebGL unavailable", error);
          setStatus("unsupported");
        }
      })
      .catch(() => setStatus("unsupported"));
    return () => {
      cancelled = true;
      observer?.disconnect();
      table.current?.dispose();
      table.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    apply();
  }, [speciesId, stage, state, accessoryKey]);

  function stopSpinning() {
    if (table.current) table.current.autoRotate = false;
    setSpinning(false);
  }

  function toggleSpinning() {
    const next = !spinning;
    if (table.current) table.current.autoRotate = next;
    setSpinning(next);
  }

  function onPointerDown(event: PointerEvent<HTMLCanvasElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY };
    stopSpinning();
  }

  function onPointerMove(event: PointerEvent<HTMLCanvasElement>) {
    if (!drag.current || !table.current) return;
    table.current.rotate((event.clientX - drag.current.x) * DRAG_YAW, (event.clientY - drag.current.y) * DRAG_PITCH);
    drag.current = { x: event.clientX, y: event.clientY };
  }

  function onPointerUp() {
    drag.current = null;
  }

  function onKeyDown(event: KeyboardEvent<HTMLCanvasElement>) {
    const t = table.current;
    if (!t) return;
    const steps: Record<string, [number, number]> = { ArrowLeft: [-KEY_STEP, 0], ArrowRight: [KEY_STEP, 0], ArrowUp: [0, KEY_STEP / 2], ArrowDown: [0, -KEY_STEP / 2] };
    const step = steps[event.key];
    if (!step) return;
    event.preventDefault();
    stopSpinning();
    t.rotate(step[0], step[1]);
  }

  if (!species) return null;
  const label = `${species.name} en 3D`;

  return (
    <div className={cn("space-y-2", className)}>
      <div ref={box} className="relative aspect-square w-full overflow-hidden rounded-3xl border border-ink-600/80 bg-gradient-to-b from-ink-800 to-ink-900">
        {status === "unsupported" ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center">
            <Creature species={species} stage={stage} state={state} accessories={accessories} size={160} />
            <p className="text-xs text-cream-500">La 3D n&apos;est pas disponible dans ce navigateur : voici le dessin.</p>
          </div>
        ) : (
          <canvas
            ref={canvas}
            role="img"
            aria-label={`${label} — flèches du clavier ou glisser pour tourner`}
            tabIndex={0}
            data-creature-3d={species.id}
            data-status={status}
            className="h-full w-full touch-none cursor-grab select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass-400/70 active:cursor-grabbing"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onKeyDown={onKeyDown}
          />
        )}
        {status === "loading" ? <p className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-xs text-cream-500">Chargement de la 3D…</p> : null}
      </div>
      <AccessorySprites ref={sprites} items={[{ speciesId, accessories }]} />
      {status === "ready" ? (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-cream-500">
          <span>Glisse pour tourner à 360°.</span>
          <button
            type="button"
            onClick={toggleSpinning}
            aria-pressed={spinning}
            className={cn(
              "inline-flex min-h-10 items-center gap-1 rounded-full border px-3 font-semibold transition-colors",
              spinning ? "border-sage-400/70 bg-sage-500/15 text-sage-200" : "border-ink-600 bg-ink-800 text-cream-300 hover:border-ink-400",
            )}
          >
            <RotateCw className="h-4 w-4" aria-hidden="true" />
            Rotation auto
          </button>
        </div>
      ) : null}
    </div>
  );
}
