import { toCreatureView, type CreatureView } from "@/lib/game/creature-view";
import { getGameRules } from "@/lib/game/rules-service";
import { getActiveCreatureTicked, refreshEggSteps } from "./service";

/**
 * Loads the user's active creature as a client-safe view. Eggs get their
 * step count refreshed; living creatures get the lazy tick (and may come
 * back dead if they were neglected for too long).
 */
export async function loadActiveCreatureView(userId: string, now: Date = new Date()): Promise<CreatureView | null> {
  const rules = await getGameRules();
  const creature = await getActiveCreatureTicked(userId, now, rules);
  if (!creature) return null;
  const fresh = creature.status === "egg" ? await refreshEggSteps(creature) : creature;
  return toCreatureView(fresh, now, rules);
}
