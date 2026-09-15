import type { EquippedAccessory } from "@/components/creatures/creature";
import type { StageId } from "@/lib/game/config";
import type { CreatureState } from "@/lib/game/creature-view";

/** What the AR screen knows about the creature to draw. */
export type ArCreature = {
  name: string | null;
  speciesId: string;
  stage: StageId;
  state: CreatureState;
  accessories: EquippedAccessory[];
};

/**
 * A renderer draws the creature inside a `size × size` box whose bottom
 * centre sits on the marker; the viewer positions and scales that box every
 * frame without re-rendering React. Levels (spec § 3.19):
 * - 1 `billboard`: the flat SVG, always facing the camera (this one).
 * - 2 `views`: the same, choosing among several drawn views from `view`
 *   (derived from the marker's in-plane angle, updated only when it changes).
 * - 3 `three`: a glTF model rendered with Three.js from the full pose.
 */
export type ArRendererProps = {
  creature: ArCreature;
  size: number;
  /** Quantised orientation for multi-view renderers (0 = facing the camera). Unused by the billboard. */
  view: number;
};
