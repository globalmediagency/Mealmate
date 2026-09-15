import { turnFeature, type Placement } from "@/lib/creatures/turnaround";
import type { Layout } from "./layout";

/** What a part needs to draw itself on a turned head or body. */
export type FeaturePlacement = Pick<Placement, "x" | "squash" | "visible">;

export type TurnPlacements = {
  yaw: number;
  /** cos(yaw): 1 facing the camera, −1 turned away. */
  facing: number;
  eyes: { l: FeaturePlacement; r: FeaturePlacement };
  cheeks: { l: FeaturePlacement; r: FeaturePlacement };
  mouth: FeaturePlacement;
  eyeAccessory: FeaturePlacement;
  ears: { left: FeaturePlacement & { mirror: boolean }; right: FeaturePlacement & { mirror: boolean }; hornX: number };
  tail: { x: number; mirror: boolean; inFront: boolean };
  /** Horizontal shifts of the hat and of the neck accessory. */
  headShiftX: number;
  neckShiftX: number;
};

const pick = ({ x, squash, visible }: Placement): FeaturePlacement => ({ x, squash, visible });

/** Placements of every movable part for a creature turned by `yaw` degrees (spec § 3.19, level 2). */
export function turnPlacements(layout: Layout, yaw: number): TurnPlacements {
  const r = layout.head.r;
  const sin = Math.sin((yaw * Math.PI) / 180);
  const ear = (point: readonly [number, number]) => {
    const p = turnFeature(point[0] - layout.head.cx, r, yaw, { minSquash: 0.45 });
    return { ...pick(p), visible: true, mirror: p.x < 0 };
  };
  const tail = turnFeature(layout.tail[0] - layout.body.cx, layout.body.rx, yaw, { behind: true });
  return {
    yaw,
    facing: Math.cos((yaw * Math.PI) / 180),
    eyes: { l: pick(turnFeature(-layout.eyeGap, r * 0.85, yaw)), r: pick(turnFeature(layout.eyeGap, r * 0.85, yaw)) },
    cheeks: { l: pick(turnFeature(-layout.cheekGap, r * 0.9, yaw)), r: pick(turnFeature(layout.cheekGap, r * 0.9, yaw)) },
    mouth: pick(turnFeature(0, r * 0.7, yaw)),
    eyeAccessory: pick(turnFeature(0, r * 0.8, yaw)),
    ears: { left: ear(layout.ears.left), right: ear(layout.ears.right), hornX: -sin * r * 0.35 },
    tail: { x: tail.x, mirror: tail.x < 0, inFront: tail.depth > 0.1 },
    headShiftX: -sin * r * 0.3,
    neckShiftX: -sin * layout.body.rx * 0.35,
  };
}
