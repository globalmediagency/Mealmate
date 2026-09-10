import { toCreatureView, type CreatureView } from "@/lib/game/creature-view";
import { getActiveCreature, refreshEggSteps } from "./service";

/**
 * Loads the user's active creature as a client-safe view. Eggs get their
 * step count refreshed; living creatures will get the lazy tick (phase 4).
 */
export async function loadActiveCreatureView(userId: string): Promise<CreatureView | null> {
  const creature = await getActiveCreature(userId);
  if (!creature) return null;
  const fresh = creature.status === "egg" ? await refreshEggSteps(creature) : creature;
  return toCreatureView(fresh);
}
