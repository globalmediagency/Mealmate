import { useId, type CSSProperties, type ReactNode } from "react";
import type { Species } from "@/lib/creatures/types";
import type { StageId } from "@/lib/game/config";
import type { CreatureState } from "@/lib/game/creature-view";
import { cn } from "@/lib/utils/cn";
import { LAYOUTS, hashUnit, shade, stageScales } from "./layout";
import { BodyShape, HeadShape } from "./parts/bodies";
import { Ears } from "./parts/ears";
import { ReactionParticles, SageAura, SickOverlay, type Reaction } from "./parts/effects";
import { Eyes } from "./parts/eyes";
import { BackExtra, FrontExtra } from "./parts/extras";
import { BackMarkings, BodyMarkings, HeadMarkings } from "./parts/markings";
import { Mouth } from "./parts/mouths";
import { HeadSignature, NeckSignature } from "./parts/signatures";
import { Tail } from "./parts/tails";

export type { Reaction } from "./parts/effects";

/** Accessory equipped on a slot (rendered from phase 5 on). */
export type EquippedAccessory = { slot: "head" | "eyes" | "neck" | "body"; id: string };

export type CreatureRenderProps = {
  species: Species;
  stage?: StageId;
  state?: CreatureState;
  accessories?: EquippedAccessory[];
  size?: number | string;
  animated?: boolean;
  reaction?: Reaction | null;
  /** Flat dark silhouette (collection / egg choice). */
  silhouette?: boolean;
  className?: string;
  style?: CSSProperties;
  title?: string;
};

/** Swappable renderer (SVG today, sprites later) — see SPEC.md § 5. */
export type CreatureRenderer = (props: CreatureRenderProps) => ReactNode;

const MARKING_OPACITY: Record<StageId, number> = { bebe: 0, enfant: 0.6, adulte: 1, sage: 1 };

export const SvgCreatureRenderer: CreatureRenderer = ({
  species,
  stage = "enfant",
  state = "healthy",
  size = 200,
  animated = true,
  reaction = null,
  silhouette = false,
  className,
  style,
  title,
}) => {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const layout = LAYOUTS[species.parts.body];
  const scales = stageScales(stage, layout.hasDistinctHead);
  const { palette, parts } = species;
  const extras = parts.extra === null ? [] : Array.isArray(parts.extra) ? parts.extra : [parts.extra];
  const markingOpacity = MARKING_OPACITY[stage];
  const isSage = stage === "sage";
  const isAlive = state !== "dead";
  const blinkDuration = 3 + hashUnit(species.id, 1) * 3;
  const blinkDelay = hashUnit(species.id, 2) * 2;

  const filter =
    silhouette ? `url(#${uid}-silhouette)` : state === "sick" ? `url(#${uid}-sick)` : state === "tired" ? `url(#${uid}-tired)` : state === "dead" ? `url(#${uid}-dead)` : undefined;

  const scaleAbout = (x: number, y: number, factor: number) =>
    `translate(${x} ${y}) scale(${factor}) translate(${-x} ${-y})`;
  const headTransform = scaleAbout(layout.head.cx, layout.head.cy, scales.head);
  const faceTransform = scaleAbout(50, layout.eyeY + 4, scales.face);
  const bodyTransform = scaleAbout(50, 92, scales.body);
  const overallTransform = scaleAbout(50, 92, scales.overall);

  const face = (
    <g transform={faceTransform}>
      {isAlive && state !== "sick" ? (
        <g fill={palette.accent} opacity="0.5">
          <ellipse cx={50 - layout.cheekGap} cy={layout.cheekY} rx="3.6" ry="2.1" />
          <ellipse cx={50 + layout.cheekGap} cy={layout.cheekY} rx="3.6" ry="2.1" />
        </g>
      ) : null}
      <Eyes type={parts.eyes} layout={layout} palette={palette} state={state} uid={uid} lidColor={palette.primary} />
      <Mouth type={parts.mouth} layout={layout} palette={palette} state={state} />
    </g>
  );

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      role="img"
      aria-label={title ?? species.name}
      className={cn(
        "mm-creature",
        animated && !silhouette && "mm-anim",
        `mm-state-${state}`,
        reaction && `mm-react-${reaction}`,
        className,
      )}
      style={{ "--mm-blink-dur": `${blinkDuration.toFixed(2)}s`, "--mm-blink-delay": `${blinkDelay.toFixed(2)}s`, ...style } as CSSProperties}
    >
      <defs>
        <linearGradient id={`${uid}-skin`} x1="0.2" y1="0" x2="0.8" y2="1">
          <stop offset="0" stopColor={shade(palette.primary, 0.18)} />
          <stop offset="0.55" stopColor={palette.primary} />
          <stop offset="1" stopColor={shade(palette.primary, -0.22)} />
        </linearGradient>
        <radialGradient id={`${uid}-aura`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor={palette.accent} stopOpacity="0.45" />
          <stop offset="1" stopColor={palette.accent} stopOpacity="0" />
        </radialGradient>
        <filter id={`${uid}-sick`} colorInterpolationFilters="sRGB">
          <feColorMatrix type="matrix" values="0.72 0.18 0.05 0 0  0.12 0.92 0.06 0 0.02  0.05 0.18 0.62 0 0  0 0 0 1 0" />
        </filter>
        <filter id={`${uid}-tired`} colorInterpolationFilters="sRGB">
          <feColorMatrix type="saturate" values="0.6" />
        </filter>
        <filter id={`${uid}-dead`} colorInterpolationFilters="sRGB">
          <feColorMatrix type="matrix" values="0.28 0.3 0.3 0 0.08  0.28 0.3 0.3 0 0.12  0.32 0.34 0.34 0 0.24  0 0 0 0.62 0" />
        </filter>
        <filter id={`${uid}-silhouette`} colorInterpolationFilters="sRGB">
          <feColorMatrix type="matrix" values="0 0 0 0 0.19  0 0 0 0 0.23  0 0 0 0 0.19  0 0 0 1 0" />
        </filter>
      </defs>

      {isAlive && !silhouette ? (
        <ellipse cx="50" cy="93.5" rx={20 * scales.overall * scales.body} ry="2.6" fill="#000" opacity="0.28" />
      ) : null}

      <g transform={overallTransform} filter={filter}>
        <g className={cn("mm-breathe", state === "dead" && "mm-ghost", state === "sick" && "mm-tremble")}>
          <g className="mm-root">
            {isSage && !silhouette ? <SageAura layout={layout} /> : null}

            {/* Back layer: extras, shell/spikes, tail — scaled with the body. */}
            <g transform={bodyTransform}>
              {extras.map((extra) => (
                <BackExtra key={extra} type={extra} layout={layout} palette={palette} uid={uid} />
              ))}
              {parts.markings === "shell" ? (
                <BackMarkings type="shell" layout={layout} palette={palette} opacity={Math.max(0.6, markingOpacity)} />
              ) : null}
              <Tail type={parts.tail} layout={layout} palette={palette} />
            </g>

            {/* Body layer. */}
            <g transform={bodyTransform}>
              <BodyShape layout={layout} palette={palette} gradientId={`${uid}-skin`} serpent={parts.body === "serpent"} />
              <BodyMarkings type={parts.markings} layout={layout} palette={palette} opacity={markingOpacity} />
              {!layout.hasDistinctHead ? <Ears type={parts.ears} layout={layout} palette={palette} /> : null}
              {isSage ? <NeckSignature type={species.signature} layout={layout} palette={palette} /> : null}
            </g>

            {/* Head layer (distinct heads grow on babies). */}
            {layout.hasDistinctHead ? (
              <g transform={headTransform}>
                {parts.markings === "spikes" ? (
                  <BackMarkings type="spikes" layout={layout} palette={palette} opacity={Math.max(0.7, markingOpacity)} />
                ) : null}
                <Ears type={parts.ears} layout={layout} palette={palette} />
                <HeadShape layout={layout} gradientId={`${uid}-skin`} />
                <HeadMarkings type={parts.markings} layout={layout} palette={palette} opacity={markingOpacity} />
                {face}
                {isSage ? <HeadSignature type={species.signature} layout={layout} palette={palette} /> : null}
                {extras.map((extra) => (
                  <FrontExtra key={extra} type={extra} layout={layout} palette={palette} uid={uid} />
                ))}
                {state === "sick" && !silhouette ? <SickOverlay layout={layout} /> : null}
              </g>
            ) : (
              <g>
                <HeadMarkings type={parts.markings} layout={layout} palette={palette} opacity={markingOpacity} />
                {face}
                {isSage ? <HeadSignature type={species.signature} layout={layout} palette={palette} /> : null}
                {extras.map((extra) => (
                  <FrontExtra key={extra} type={extra} layout={layout} palette={palette} uid={uid} />
                ))}
                {state === "sick" && !silhouette ? <SickOverlay layout={layout} /> : null}
              </g>
            )}
          </g>
        </g>
      </g>

      {reaction && !silhouette ? (
        <g transform={overallTransform}>
          <ReactionParticles reaction={reaction} layout={layout} />
        </g>
      ) : null}
    </svg>
  );
};

let activeRenderer: CreatureRenderer = SvgCreatureRenderer;

/** Allows swapping the renderer (e.g. pixel-art sprites) without touching call sites. */
export function setCreatureRenderer(renderer: CreatureRenderer): void {
  activeRenderer = renderer;
}

export function Creature(props: CreatureRenderProps) {
  return activeRenderer(props);
}
