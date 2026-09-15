import { AR_MARKER } from "./config";

/**
 * Picks a marker number for a creature: uniformly among the numbers not
 * used by the creatures the owner is likely to see next to it (their own and
 * their friends'). When everything is taken, any number will do: the viewer
 * then shows the creature with the highest priority for that number.
 */
export function pickMarkerId(taken: ReadonlySet<number>, random: () => number = Math.random, count: number = AR_MARKER.ids): number {
  const free: number[] = [];
  for (let id = 0; id < count; id += 1) if (!taken.has(id)) free.push(id);
  const pool = free.length > 0 ? free : Array.from({ length: count }, (_, i) => i);
  const index = Math.min(pool.length - 1, Math.max(0, Math.floor(random() * pool.length)));
  return pool[index];
}
