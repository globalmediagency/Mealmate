"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { ACCESSORY_RENDERERS } from "@/components/accessories";
import { Creature, type EquippedAccessory, type Reaction } from "@/components/creatures/creature";
import { LAYOUTS, stageScales } from "@/components/creatures/layout";
import type { Slot } from "@/lib/accessories/catalog";
import type { Species } from "@/lib/creatures/types";
import { TOSS, type StageId } from "@/lib/game/config";
import type { CreatureState } from "@/lib/game/creature-view";
import { createToss, dressToss, grabToss, isTossActive, moveToss, releaseToss, resizeToss, stepToss, type AnchorOf, type LooseAccessory, type TossEvent, type TossPhase, type TossState } from "@/lib/game/toss";
import { cn } from "@/lib/utils/cn";

export type ThrowableCreatureProps = {
  species: Species;
  stage: StageId;
  state: CreatureState;
  accessories: EquippedAccessory[];
  /** Side of the drawing (px). */
  size?: number;
  reaction?: Reaction | null;
  /** Accessible name of the creature button ("Caresser Miso"). */
  label: string;
  /** False = a plain pat button (dead creature, reduced motion). */
  throwable?: boolean;
  onTap?: () => void;
  onToss?: (event: TossEvent) => void;
};

/** Physics sub-step (s): fast enough for a 2 800 px/s throw against the walls. */
const SUB_STEP = 1 / 120;
/** A frame longer than this (tab hidden) is not caught up. */
const MAX_FRAME_SECONDS = 0.1;
/** The stand-alone accessory drawings use this viewBox (origin = anchor). */
const ITEM_VIEWBOX = { x: -36, y: -44, side: 72 };

type Sample = { x: number; y: number; t: number };

/** Where each slot sits on the drawing, as pixel offsets from its centre (stage scale applied about the ground line, like the SVG). */
function anchorsFor(species: Species, stage: StageId, size: number): AnchorOf {
  const layout = LAYOUTS[species.parts.body];
  const scales = stageScales(stage, layout.hasDistinctHead);
  const points: Record<Slot, readonly [number, number]> = {
    head: [layout.head.cx, layout.top],
    eyes: [layout.faceX, layout.eyeY],
    neck: layout.neck,
    body: [layout.body.cx, layout.body.cy],
  };
  return (slot) => {
    const [x, y] = points[slot];
    const sx = 50 + (x - 50) * scales.overall;
    const sy = 92 + (y - 92) * scales.overall;
    return { dx: ((sx - 50) / 100) * size, dy: ((sy - 50) / 100) * size };
  };
}

const creatureTransform = (s: TossState) => `translate(${(s.x - s.size / 2).toFixed(1)}px, ${(s.y - s.size / 2).toFixed(1)}px) rotate(${s.angle.toFixed(1)}deg)`;
const itemTransform = (item: LooseAccessory, box: number) =>
  `translate(${(item.x - (box * -ITEM_VIEWBOX.x) / ITEM_VIEWBOX.side).toFixed(1)}px, ${(item.y - (box * -ITEM_VIEWBOX.y) / ITEM_VIEWBOX.side).toFixed(1)}px) rotate(${item.angle.toFixed(1)}deg)`;

/**
 * The creature of the home screen, to pat or to throw (spec § 3.5): grabbed
 * with the finger it follows it, released fast it flies, bounces off the
 * walls of its scene losing one accessory per hard hit, lands, then runs to
 * pick each one up and comes back. Physics in `lib/game/toss.ts`; positions
 * are written to `style.transform` from `requestAnimationFrame`, React only
 * re-renders on a phase change or when an accessory comes off or back on.
 * Keyboard: Enter / Space pat it. With reduced motion, it is only patted.
 */
export function ThrowableCreature({ species, stage, state, accessories, size = 220, reaction = null, label, throwable = true, onTap, onToss }: ThrowableCreatureProps) {
  const box = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const items = useRef(new Map<string, HTMLDivElement>());
  const toss = useRef<TossState | null>(null);
  const raf = useRef<number | null>(null);
  const last = useRef(0);
  const press = useRef<{ x: number; y: number; t: number; moved: boolean } | null>(null);
  const samples = useRef<Sample[]>([]);
  const anchorOf = useRef<AnchorOf>(anchorsFor(species, stage, size));
  anchorOf.current = anchorsFor(species, stage, size);
  const callbacks = useRef({ onTap, onToss });
  callbacks.current = { onTap, onToss };

  const [worn, setWorn] = useState<EquippedAccessory[]>(accessories);
  const [loose, setLoose] = useState<LooseAccessory[]>([]);
  const [phase, setPhase] = useState<TossPhase>("idle");
  const [facing, setFacing] = useState<-1 | 0 | 1>(0);
  const [reduced, setReduced] = useState(false);
  const canThrow = throwable && !reduced;

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  /** Writes every position to the DOM (no React). */
  const paint = useCallback(() => {
    const s = toss.current;
    if (!s) return;
    if (button.current) button.current.style.transform = creatureTransform(s);
    const itemBox = (ITEM_VIEWBOX.side * s.size) / 100;
    for (const item of s.loose) {
      const el = items.current.get(item.key);
      if (el) el.style.transform = itemTransform(item, itemBox);
    }
  }, []);

  const stop = useCallback(() => {
    if (raf.current !== null) cancelAnimationFrame(raf.current);
    raf.current = null;
    last.current = 0;
  }, []);

  const tick = useCallback(
    (now: number) => {
      raf.current = null;
      const s = toss.current;
      if (!s) return;
      const elapsed = last.current > 0 ? Math.min(MAX_FRAME_SECONDS, (now - last.current) / 1000) : 0;
      last.current = now;
      const before = { phase: s.phase, facing: s.facing, worn: s.worn.length, loose: s.loose.length };
      const events: TossEvent[] = [];
      for (let left = elapsed; left > 0; left -= SUB_STEP) events.push(...stepToss(s, Math.min(SUB_STEP, left), Math.random, anchorOf.current));
      paint();
      if (s.phase !== before.phase) setPhase(s.phase);
      if (s.facing !== before.facing) setFacing(s.facing);
      if (s.worn.length !== before.worn) setWorn([...s.worn]);
      if (s.loose.length !== before.loose) setLoose([...s.loose]);
      for (const event of events) callbacks.current.onToss?.(event);
      if (isTossActive(s)) raf.current = requestAnimationFrame(tick);
      else stop();
    },
    [paint, stop],
  );

  const run = useCallback(() => {
    if (raf.current === null) raf.current = requestAnimationFrame(tick);
  }, [tick]);

  // The scene's size drives the physics: created once known, followed on resize.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const bounds = () => ({ width: el.clientWidth, height: el.clientHeight });
    const s = createToss(bounds(), size, accessories);
    toss.current = s;
    paint();
    const observer = new ResizeObserver(() => {
      resizeToss(s, bounds());
      paint();
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      stop();
      toss.current = null;
    };
    // The outfit is followed by the effect below; the size never changes on a screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size, paint, stop]);

  // A new outfit (wardrobe, server refresh): worn in full, nothing on the floor.
  const outfitKey = accessories.map((a) => `${a.slot}:${a.id}`).join("|");
  useEffect(() => {
    const s = toss.current;
    if (!s) return;
    dressToss(s, accessories);
    setWorn([...s.worn]);
    setLoose([]);
    paint();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outfitKey, paint]);

  function local(event: ReactPointerEvent): { x: number; y: number } {
    const rect = box.current?.getBoundingClientRect();
    return rect ? { x: event.clientX - rect.left, y: event.clientY - rect.top } : { x: event.clientX, y: event.clientY };
  }

  function onPointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    const s = toss.current;
    if (!canThrow || !s || (event.pointerType === "mouse" && event.button !== 0)) return;
    event.preventDefault();
    const p = local(event);
    const t = performance.now();
    press.current = { x: p.x, y: p.y, t, moved: false };
    samples.current = [{ x: p.x, y: p.y, t }];
    event.currentTarget.setPointerCapture(event.pointerId);
    grabToss(s, p.x, p.y);
    setPhase(s.phase);
    setFacing(0);
    paint();
    run();
  }

  function onPointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const s = toss.current;
    const pressed = press.current;
    if (!pressed || !s || s.phase !== "held") return;
    const p = local(event);
    const t = performance.now();
    moveToss(s, p.x, p.y);
    if (Math.hypot(p.x - pressed.x, p.y - pressed.y) > TOSS.tapDistance) pressed.moved = true;
    samples.current.push({ x: p.x, y: p.y, t });
    samples.current = samples.current.filter((sample) => t - sample.t <= TOSS.velocityWindowMs * 2);
    paint();
  }

  function onPointerUp(event: ReactPointerEvent<HTMLButtonElement>) {
    const s = toss.current;
    const pressed = press.current;
    press.current = null;
    if (!pressed || !s || s.phase !== "held") return;
    const t = performance.now();
    const p = local(event);
    samples.current.push({ x: p.x, y: p.y, t });
    const recent = samples.current.filter((sample) => t - sample.t <= TOSS.velocityWindowMs);
    const first = recent[0] ?? samples.current[0];
    const span = Math.max(0.016, (t - first.t) / 1000);
    const tap = !pressed.moved && t - pressed.t < TOSS.tapMs;
    const vx = tap ? 0 : (p.x - first.x) / span;
    const vy = tap ? 0 : (p.y - first.y) / span;
    const events = releaseToss(s, vx, vy);
    setPhase(s.phase);
    paint();
    run();
    for (const e of events) callbacks.current.onToss?.(e);
    if (tap) callbacks.current.onTap?.();
  }

  function onClick(event: React.MouseEvent<HTMLButtonElement>) {
    // Pointer presses are handled above; the keyboard (detail = 0) and the non-throwable button pat here.
    if (!canThrow || event.detail === 0) callbacks.current.onTap?.();
  }

  const yaw = facing === -1 ? TOSS.runYaw : facing === 1 ? 360 - TOSS.runYaw : 0;
  const itemBox = (ITEM_VIEWBOX.side * size) / 100;
  const busy = phase !== "idle";

  return (
    <div ref={box} className="pointer-events-none absolute inset-0" data-toss data-toss-phase={phase} data-toss-worn={worn.length} data-toss-loose={loose.length}>
      <button
        ref={button}
        type="button"
        onClick={onClick}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        aria-label={busy ? label.replace(/^Caresser/, "Attraper") : label}
        title={canThrow ? "Caresse-la, ou attrape-la et lance-la !" : undefined}
        draggable={false}
        className={cn("pointer-events-auto absolute left-0 top-0 select-none focus-visible:outline-none", canThrow ? (phase === "held" ? "cursor-grabbing" : "cursor-grab") : "cursor-pointer")}
        style={{ width: size, height: size, touchAction: "none", willChange: "transform", transformOrigin: "50% 50%", WebkitTapHighlightColor: "transparent" } as CSSProperties}
      >
        <div className={cn("mm-toss", `mm-toss-${phase}`)}>
          <Creature species={species} stage={stage} state={state} size={size} reaction={reaction} accessories={worn} yaw={yaw} />
        </div>
      </button>
      {loose.map((item) => {
        const renderer = ACCESSORY_RENDERERS[item.id];
        return (
          <div
            key={item.key}
            ref={(el) => {
              if (el) items.current.set(item.key, el);
              else items.current.delete(item.key);
            }}
            data-loose-accessory={item.id}
            className="absolute left-0 top-0"
            style={{ width: itemBox, height: itemBox, transform: itemTransform(item, itemBox), transformOrigin: `${(-ITEM_VIEWBOX.x / ITEM_VIEWBOX.side) * 100}% ${(-ITEM_VIEWBOX.y / ITEM_VIEWBOX.side) * 100}%`, willChange: "transform" }}
          >
            <svg viewBox={`${ITEM_VIEWBOX.x} ${ITEM_VIEWBOX.y} ${ITEM_VIEWBOX.side} ${ITEM_VIEWBOX.side}`} width={itemBox} height={itemBox} aria-hidden="true" className="overflow-visible">
              {renderer?.back?.({ palette: species.palette })}
              {renderer?.front?.({ palette: species.palette })}
            </svg>
          </div>
        );
      })}
    </div>
  );
}
