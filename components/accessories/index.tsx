import type { ReactNode } from "react";
import { getAccessory, type Slot } from "@/lib/accessories/catalog";
import type { Point, SpeciesPalette } from "@/lib/creatures/types";
import { BODY_ACCESSORIES } from "./body";
import { EYES_ACCESSORIES } from "./eyes";
import { HEAD_ACCESSORIES } from "./head";
import { NECK_ACCESSORIES } from "./neck";

export type AccessoryRenderProps = { palette: SpeciesPalette };

/** An accessory may draw behind the body (`back`) and/or in front (`front`). */
export type AccessoryRenderer = {
  front?: (props: AccessoryRenderProps) => ReactNode;
  back?: (props: AccessoryRenderProps) => ReactNode;
};

export const ACCESSORY_RENDERERS: Record<string, AccessoryRenderer> = {
  ...HEAD_ACCESSORIES,
  ...EYES_ACCESSORIES,
  ...NECK_ACCESSORIES,
  ...BODY_ACCESSORIES,
};

export function hasRenderer(id: string): boolean {
  return id in ACCESSORY_RENDERERS;
}

type AccessoryAtProps = {
  id: string;
  anchor: Point;
  layer: "front" | "back";
  palette: SpeciesPalette;
  scale?: number;
};

/** Renders one accessory at a species anchor (viewBox coordinates). */
export function AccessoryAt({ id, anchor, layer, palette, scale = 1 }: AccessoryAtProps) {
  const renderer = ACCESSORY_RENDERERS[id]?.[layer];
  if (!renderer) return null;
  return <g transform={`translate(${anchor[0]} ${anchor[1]}) scale(${scale})`}>{renderer({ palette })}</g>;
}

/** Stand-alone preview of an accessory (wardrobe grid, reward screen). */
export function AccessoryIcon({ id, size = 64, palette, className }: { id: string; size?: number; palette?: SpeciesPalette; className?: string }) {
  const accessory = getAccessory(id);
  const renderer = ACCESSORY_RENDERERS[id];
  if (!accessory || !renderer) return null;
  const pal: SpeciesPalette = palette ?? { primary: "#8ba07a", secondary: "#5e7053", accent: "#e8c36a", eye: "#2b2b2b" };
  const offsets: Record<Slot, Point> = { head: [50, 60], eyes: [50, 50], neck: [50, 48], body: [50, 50] };
  const [ox, oy] = offsets[accessory.slot];
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} role="img" aria-label={accessory.name} className={className}>
      <g transform={`translate(${ox} ${oy}) scale(1.6)`}>
        {renderer.back?.({ palette: pal })}
        {renderer.front?.({ palette: pal })}
      </g>
    </svg>
  );
}
