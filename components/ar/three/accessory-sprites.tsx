"use client";

import type { Ref } from "react";
import { AccessoryLayerSvg, hasAccessoryLayer } from "@/components/accessories";
import type { EquippedAccessory } from "@/components/creatures/creature";
import { getSpecies } from "@/lib/creatures";

export type AccessorySpriteItem = { speciesId: string; accessories: EquippedAccessory[] };

/**
 * Hidden accessory drawings the 3D scenes turn into textures (spec § 3.19,
 * level 3): one stand-alone SVG per species × accessory × layer, tinted with
 * the species palette. Read back with `accessoryMarkup()`.
 */
export function AccessorySprites({ ref, items }: { ref: Ref<HTMLDivElement>; items: AccessorySpriteItem[] }) {
  const seen = new Set<string>();
  return (
    <div ref={ref} hidden aria-hidden="true">
      {items.flatMap((item) => {
        const species = getSpecies(item.speciesId);
        if (!species) return [];
        return item.accessories.flatMap((accessory) =>
          (["front", "back"] as const)
            .filter((layer) => hasAccessoryLayer(accessory.id, layer))
            .map((layer) => {
              const key = `${species.id}/${accessory.id}/${layer}`;
              if (seen.has(key)) return null;
              seen.add(key);
              return <AccessoryLayerSvg key={key} id={accessory.id} layer={layer} palette={species.palette} speciesId={species.id} />;
            }),
        );
      })}
    </div>
  );
}

/** The serialised SVG of one accessory layer rendered by `AccessorySprites`, or null when absent. */
export function accessoryMarkup(container: HTMLElement | null, speciesId: string, accessoryId: string, layer: "front" | "back"): string | null {
  const svg = container?.querySelector(`svg[data-acc="${accessoryId}"][data-layer="${layer}"][data-species="${speciesId}"]`);
  return svg ? new XMLSerializer().serializeToString(svg) : null;
}
