import { useId } from "react";
import { getBackdrop, type BackdropId } from "@/lib/backdrops/catalog";
import type { Tier } from "@/lib/game/config";
import { cn } from "@/lib/utils/cn";
import { SCENES } from "./scenes";

type BackdropProps = { id: BackdropId; tier: Tier; className?: string };

/** The scene behind the creature (spec § 3.28): one drawing per backdrop of the catalogue, with a few details that follow the tier. */
export function Backdrop({ id, tier, className }: BackdropProps) {
  const uid = `bd${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const Scene = SCENES[id] ?? SCENES.foret;
  return (
    <svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMax slice" aria-hidden="true" className={cn("h-full w-full", className)} data-backdrop={id}>
      <Scene tier={tier} uid={uid} />
    </svg>
  );
}

/** Whether a drawing exists for a backdrop id (the catalogue test checks every entry). */
export function hasBackdropRenderer(id: string): boolean {
  return getBackdrop(id) !== undefined && id in SCENES;
}
