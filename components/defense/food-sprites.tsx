"use client";

import type { Ref } from "react";
import { FoodIcon } from "@/components/food/food-icon";
import { JUNK_KINDS, type JunkKind } from "@/lib/game/defense";

/** Hidden drawings of every junk food, rasterised into the sprites of "Défendre" (spec § 3.21). */
export function FoodSprites({ ref }: { ref: Ref<HTMLDivElement> }) {
  return (
    <div ref={ref} hidden aria-hidden="true">
      {JUNK_KINDS.map((kind) => (
        <div key={kind} data-food={kind}>
          <FoodIcon kind={kind} size={48} />
        </div>
      ))}
    </div>
  );
}

/** The serialised SVG of one food drawing rendered by `FoodSprites`, or null. */
export function foodMarkup(container: HTMLElement | null, kind: JunkKind): string | null {
  const svg = container?.querySelector(`div[data-food="${kind}"] svg`);
  return svg ? new XMLSerializer().serializeToString(svg) : null;
}
