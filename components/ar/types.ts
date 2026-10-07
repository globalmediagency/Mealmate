import type { EquippedAccessory } from "@/components/creatures/creature";
import type { StageId } from "@/lib/game/config";
import type { CreatureState } from "@/lib/game/creature-view";

/** What the AR screen knows about a creature to draw. */
export type ArCreature = {
  name: string | null;
  speciesId: string;
  stage: StageId;
  state: CreatureState;
  accessories: EquippedAccessory[];
};

/** A creature the viewer may see on a printed marker (spec § 3.19). */
export type ArTarget = {
  /** AprilTag number printed on the creature's own marker. */
  markerId: number;
  creature: ArCreature;
  /** The viewer's own creature. */
  mine: boolean;
  /** Owner's username when the creature is someone else's (a friend's, or boarded with the viewer). */
  ownerName: string | null;
};

/**
 * A renderer draws the creature inside a `size × size` box whose bottom
 * centre sits on the marker; the viewer positions and scales that box every
 * frame without re-rendering React. Levels (spec § 3.19):
 * - 1 `billboard`: the flat SVG, always facing the camera (superseded).
 * - 2 `views` (fallback): the same drawing turned by `view × 45°` through the
 *   fake-3D turnaround (`lib/creatures/turnaround.ts`), `view` derived from the
 *   marker's in-plane angle with hysteresis and updated only when it changes.
 * - 3 `three` (`components/ar/three/`): the creature built in 3D from its
 *   parts and rendered with Three.js from the marker's full pose; the eight
 *   views remain the fallback when WebGL is unavailable.
 */
export type ArRendererProps = {
  creature: ArCreature;
  size: number;
  /** Quantised orientation, 0–7 (0 = facing the camera, then 45° steps clockwise seen from above). */
  view: number;
};
