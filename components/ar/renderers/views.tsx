"use client";

import { Creature } from "@/components/creatures/creature";
import { getSpecies } from "@/lib/creatures";
import { yawForView } from "@/lib/creatures/turnaround";
import type { ArRendererProps } from "../types";

/** Level 2: the creature standing on the marker, drawn from one of eight angles chosen from the paper's rotation. */
export function ViewsRenderer({ creature, size, view }: ArRendererProps) {
  const species = getSpecies(creature.speciesId);
  if (!species) return null;
  return <Creature species={species} stage={creature.stage} state={creature.state} accessories={creature.accessories} size={size} yaw={yawForView(view)} />;
}
