import { AR_SCENE } from "@/lib/game/config";

/** Creature height in marker sides (the printed square is 1) at the default scale; `rules.ar.creatureHeight` scales the stage. */
export const CREATURE_HEIGHT_UNITS: number = AR_SCENE.creatureHeight;
/** One viewBox unit of the 2D drawings, in marker sides. */
export const UNIT = CREATURE_HEIGHT_UNITS / 100;
