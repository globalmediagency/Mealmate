import type { CSSProperties } from "react";
import { AccessoryAt } from "@/components/accessories";
import { parsePixelArt, PIXEL_CELL, PIXEL_LEFT, PIXEL_PALETTES, PIXEL_SILHOUETTE, PIXEL_TOP, pixelRunsPath, pixelStageScale, pixelY, type PixelArt, type PixelBox, type PixelSprite } from "@/lib/creatures/pixel";
import { cn } from "@/lib/utils/cn";
import type { CreatureRenderProps, EquippedAccessory } from "./creature";
import { hashUnit, type Layout } from "./layout";
import { ReactionParticles, SickOverlay } from "./parts/effects";

const DEG = Math.PI / 180;

/**
 * The pixel-art renderer of the Zodiaque collection (spec § 3.4): the
 * species' 28 × 28 grid drawn as crisp rectangles in the four tones of the
 * creature's state, the whole sprite scaled with the stage about its feet.
 * Eyes get a highlight and the same lids as the drawn creatures (blink,
 * half-closed when tired or sick, crossed when dead), the mouth its own
 * cells; accessories, the sick overlay and the reactions use the sprite's
 * anchors. Turned (`yaw`), the sprite narrows and mirrors past its side.
 */
export function PixelCreature({ species, pixel, stage = "enfant", state = "healthy", accessories = [], size = 200, animated = true, reaction = null, silhouette = false, yaw = 0, className, style, title }: CreatureRenderProps & { pixel: PixelArt }) {
  const sprite = parsePixelArt(pixel);
  const tones = PIXEL_PALETTES[state];
  const layout = pixelLayout(sprite);
  const scale = pixelStageScale(stage);
  const isAlive = state !== "dead";
  const isSage = stage === "sage";
  const blinkDuration = 3 + hashUnit(species.id, 1) * 3;
  const blinkDelay = hashUnit(species.id, 2) * 2;
  const worn = Object.fromEntries(accessories.map((a) => [a.slot, a.id])) as Partial<Record<EquippedAccessory["slot"], string>>;
  const showAccessories = !silhouette;

  const yawDeg = ((yaw % 360) + 360) % 360;
  const facing = Math.cos(yawDeg * DEG);
  const turned = yawDeg !== 0;
  const squash = Math.max(0.3, Math.abs(facing)) * (facing < 0 ? -1 : 1);
  const transform = `translate(50 92) scale(${scale}) translate(-50 -92)${turned ? ` translate(50 0) scale(${squash} 1) translate(-50 0)` : ""}`;
  const turnedAway = facing < 0;

  const fill = (tone: 0 | 1 | 2 | 3) => (silhouette ? PIXEL_SILHOUETTE : tones[tone]);
  const cell = PIXEL_CELL;
  const cx = (col: number) => PIXEL_LEFT + col * cell;
  const cy = (row: number) => PIXEL_TOP + row * cell;
  const { anchors } = sprite;

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      role="img"
      aria-label={title ?? species.name}
      shapeRendering="crispEdges"
      className={cn("mm-creature mm-pixel", animated && !silhouette && "mm-anim", `mm-state-${state}`, reaction && `mm-react-${reaction}`, className)}
      style={{ "--mm-blink-dur": `${blinkDuration.toFixed(2)}s`, "--mm-blink-delay": `${blinkDelay.toFixed(2)}s`, ...style } as CSSProperties}
      data-pixel-species={species.id}
    >
      {isAlive && !silhouette ? <ellipse cx="50" cy="93.5" rx={20 * scale} ry="2.6" fill="#000" opacity="0.28" shapeRendering="auto" /> : null}
      <g transform={transform}>
        <g className={cn("mm-breathe", state === "dead" && "mm-ghost", state === "sick" && "mm-tremble")}>
          <g className="mm-root">
            {isSage && !silhouette ? <PixelSparkles layout={layout} color={tones[3]} /> : null}
            {showAccessories && worn.body && !turnedAway ? <AccessoryAt id={worn.body} anchor={anchors.body} layer="back" palette={species.palette} /> : null}
            {([0, 1, 2, 3] as const).map((tone) => (sprite.runs[tone].length > 0 ? <path key={tone} d={pixelRunsPath(sprite.runs[tone])} fill={fill(tone)} /> : null))}
            {!silhouette && !turnedAway
              ? sprite.eyes.map((eye, i) =>
                  state === "dead" ? (
                    <PixelCross key={i} box={eye.box} color={tones[0]} />
                  ) : (
                    <g key={i}>
                      <path d={pixelRunsPath(eye.cells)} fill={tones[0]} />
                      <rect x={cx(eye.highlight.x)} y={cy(eye.highlight.y)} width={cell} height={cell} fill={tones[3]} />
                      <rect className="mm-lid" x={cx(eye.box.x)} y={cy(eye.box.y)} width={eye.box.w * cell} height={eye.box.h * cell} fill={tones[2]} />
                    </g>
                  ),
                )
              : null}
            {!silhouette && !turnedAway && sprite.mouth.length > 0 ? <path d={pixelRunsPath(sprite.mouth)} fill={tones[0]} /> : null}
            {showAccessories && worn.body ? <AccessoryAt id={worn.body} anchor={anchors.body} layer={turnedAway ? "back" : "front"} palette={species.palette} /> : null}
            {showAccessories && worn.neck ? <AccessoryAt id={worn.neck} anchor={anchors.neck} layer="front" palette={species.palette} /> : null}
            {showAccessories && worn.eyes && !turnedAway ? <AccessoryAt id={worn.eyes} anchor={anchors.eyes} layer="front" palette={species.palette} /> : null}
            {showAccessories && worn.head ? <AccessoryAt id={worn.head} anchor={anchors.head} layer="front" palette={species.palette} /> : null}
            {state === "sick" && !silhouette ? <SickOverlay layout={layout} /> : null}
          </g>
        </g>
      </g>
      {reaction && !silhouette ? (
        <g transform={transform}>
          <ReactionParticles reaction={reaction} layout={layout} />
        </g>
      ) : null}
    </svg>
  );
}

/** Crossed eyes of a dead creature: two pixel diagonals over the eye's box. */
function PixelCross({ box, color }: { box: PixelBox; color: string }) {
  const cell = PIXEL_CELL;
  const size = Math.max(box.w, box.h, 3);
  const x0 = PIXEL_LEFT + (box.x + box.w / 2 - size / 2) * cell;
  const y0 = PIXEL_TOP + (box.y + box.h / 2 - size / 2) * cell;
  const cells: string[] = [];
  for (let i = 0; i < size; i++) {
    cells.push(`M${x0 + i * cell} ${y0 + i * cell}h${cell}v${cell}h${-cell}z`);
    cells.push(`M${x0 + (size - 1 - i) * cell} ${y0 + i * cell}h${cell}v${cell}h${-cell}z`);
  }
  return <path d={cells.join("")} fill={color} />;
}

/** Sparkles of a Sage, as plus-shaped pixels twinkling around the head. */
function PixelSparkles({ layout, color }: { layout: Layout; color: string }) {
  const { head, top } = layout;
  const spots: [number, number, number][] = [
    [head.cx - head.r - 7, top + 6, 0],
    [head.cx + head.r + 6, top + 2, 0.7],
    [head.cx + head.r + 4, head.cy + 14, 1.3],
    [head.cx - head.r - 5, head.cy + 18, 0.4],
  ];
  const c = PIXEL_CELL * 0.8;
  return (
    <g>
      {spots.map(([x, y, delay], i) => (
        <path
          key={i}
          d={`M${x - c / 2} ${y - c * 1.5}h${c}v${c * 3}h${-c}z M${x - c * 1.5} ${y - c / 2}h${c * 3}v${c}h${-c * 3}z`}
          fill={color}
          className="mm-twinkle"
          style={{ animationDelay: `${delay}s` }}
        />
      ))}
    </g>
  );
}

/** A silhouette layout deduced from the sprite, for the overlays and reactions shared with the drawn creatures. */
export function pixelLayout(sprite: PixelSprite): Layout {
  const { bounds, eyeCentre, crown, neck } = sprite;
  const top = PIXEL_TOP + crown * PIXEL_CELL;
  const eyeY = pixelY(eyeCentre.y - 0.5);
  const neckY = PIXEL_TOP + neck * PIXEL_CELL;
  const bottom = PIXEL_TOP + (bounds.y + bounds.h) * PIXEL_CELL;
  const halfWidth = (bounds.w * PIXEL_CELL) / 2;
  const r = Math.min(24, halfWidth * 0.85);
  return {
    hasDistinctHead: true,
    faceX: 50,
    head: { cx: 50, cy: eyeY + 3, r },
    body: { cx: 50, cy: (neckY + bottom) / 2, rx: halfWidth * 0.7, ry: (bottom - neckY) / 2 },
    eyeY,
    eyeGap: 8,
    eyeScale: 1,
    mouthY: eyeY + 8,
    cheekY: eyeY + 5,
    cheekGap: 12,
    ears: { left: [50 - r, top], right: [50 + r, top], tilt: 0 },
    tail: [50 + halfWidth, bottom - 10],
    neck: [50, neckY],
    top,
  };
}
