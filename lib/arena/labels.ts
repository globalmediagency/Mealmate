import type { ArenaMode } from "./service";

/** The French name of each friends' game, the same everywhere (hub, lobby, room, invitations). */
export const ARENA_MODE_LABELS: Record<ArenaMode, string> = { arena: "Arène", coop: "Défendre ensemble", pingpong: "Ping-pong" };

export const ARENA_MODES: readonly ArenaMode[] = ["arena", "coop", "pingpong"];

export function isArenaMode(value: unknown): value is ArenaMode {
  return typeof value === "string" && (ARENA_MODES as readonly string[]).includes(value);
}
