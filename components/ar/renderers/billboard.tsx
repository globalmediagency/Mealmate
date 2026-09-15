"use client";

import { Creature } from "@/components/creatures/creature";
import { getSpecies } from "@/lib/creatures";
import type { ArRendererProps } from "../types";

/** Level 1: the flat creature standing on the marker like a cardboard figure, always facing the camera. */
export function BillboardRenderer({ creature, size }: ArRendererProps) {
  const species = getSpecies(creature.speciesId);
  if (!species) return null;
  return <Creature species={species} stage={creature.stage} state={creature.state} accessories={creature.accessories} size={size} />;
}
