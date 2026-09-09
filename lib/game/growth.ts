import { STAGES, type StageId } from "./config";

export type Stage = (typeof STAGES)[number];

/** Returns the growth stage reached for a given XP amount. */
export function stageForXp(xp: number): Stage {
  let current: Stage = STAGES[0];
  for (const stage of STAGES) {
    if (xp >= stage.minXp) current = stage;
  }
  return current;
}

/** XP still needed before the next stage, or `null` at the last stage. */
export function xpToNextStage(xp: number): number | null {
  const next = STAGES.find((stage) => stage.minXp > xp);
  return next ? next.minXp - xp : null;
}

export function stageIndex(id: StageId): number {
  return STAGES.findIndex((stage) => stage.id === id);
}
