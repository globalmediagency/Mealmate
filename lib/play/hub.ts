import type { HeldCreature } from "@/lib/boarding/service";
import { getHeldCreature } from "@/lib/boarding/service";
import type { GameRules } from "@/lib/game/rules";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** What the games hub and its two doors need about the creature: the player's own, or one boarded with them (`?creature=<id>`). */
export type PlayCreature = {
  held: HeldCreature;
  creature: HeldCreature["creature"] & { name: string };
  boarded: boolean;
  /** `?creature=<id>` for a boarded creature, empty otherwise: appended to the hub's own links. */
  creatureQuery: string;
  /** Where the hub's back chevron leads. */
  backHref: string;
};

/** The living, named creature the hub is about, or null when the pages must redirect home. */
export async function loadPlayCreature(userId: string, creatureParam: string | undefined, now: Date, rules: GameRules): Promise<PlayCreature | null> {
  const creatureId = creatureParam && UUID.test(creatureParam) ? creatureParam : null;
  const held = await getHeldCreature(userId, creatureId, now, rules).catch(() => null);
  const creature = held?.creature;
  if (!held || !creature || creature.status !== "alive" || !creature.name) return null;
  const boarded = held.boarding !== null;
  return {
    held,
    creature: { ...creature, name: creature.name },
    boarded,
    creatureQuery: boarded ? `?creature=${creature.id}` : "",
    backHref: boarded ? `/pension/${creature.id}` : "/home",
  };
}
