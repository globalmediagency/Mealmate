/**
 * What two phones of an arena match say to each other over their direct
 * link (spec § 3.22), and the pure rules of the mesh. No DOM here: the
 * WebRTC plumbing lives in `components/arena/rtc-transport.ts`.
 */
import { parseCoopState, type CoopStateMessage } from "@/lib/game/coop";
import { parsePingPongState, type PingPongState, type PingPongShot } from "@/lib/game/pingpong";

/** Signals exchanged through the server to open the direct link. */
export type ArenaSignal =
  | { type: "hello"; session: string }
  | { type: "offer"; session: string; sdp: string }
  | { type: "answer"; session: string; target: string; sdp: string };

/** Messages carried by the data channel once the link is open (arena, "Défendre à deux", ping-pong). */
export type PeerMessage =
  | { t: "egg"; nonce: string; target: string | null; x: number; y: number }
  | { t: "hit"; nonce: string; target: string | null; x: number; y: number; hit: boolean }
  | { t: "tongue"; nonce: string; angle: number; length: number }
  | { t: "eat"; nonce: string; bonusIds: string[] }
  | { t: "state"; nonce: string; hostTime: number; states: CoopStateMessage["states"] }
  | { t: "fire"; nonce: string; frame: string; x: number; y: number; from: { x: number; y: number; z: number } | null }
  | { t: "smash"; nonce: string; frame: string; hits: number[]; x: number; y: number }
  | { t: "lick"; nonce: string; frame: string; angle: number; length: number }
  | { t: "catch"; nonce: string; frame: string; bonusIds: number[]; junkIds: number[] }
  | { t: "ppstate"; nonce: string; hostTime: number; state: PingPongState }
  | { t: "swing"; nonce: string; flightId: number; at: number; shot: PingPongShot }
  | { t: "serve"; nonce: string; at: number };

/** Between two players, the one with the smaller id opens the connection. */
export function isOfferer(me: string, peer: string): boolean {
  return me < peer;
}

const isNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isString = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 64;

/** Reads a message from the wire, or null when it is not one of ours (never trust a peer). */
export function parsePeerMessage(raw: unknown): PeerMessage | null {
  let data: unknown = raw;
  if (typeof raw === "string") {
    try {
      data = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!data || typeof data !== "object") return null;
  const m = data as Record<string, unknown>;
  if (!isString(m.nonce)) return null;
  const target = m.target === null || m.target === undefined ? null : isString(m.target) ? m.target : undefined;
  switch (m.t) {
    case "egg":
      if (target === undefined || !isNumber(m.x) || !isNumber(m.y)) return null;
      return { t: "egg", nonce: m.nonce, target, x: m.x, y: m.y };
    case "hit":
      if (target === undefined || !isNumber(m.x) || !isNumber(m.y) || typeof m.hit !== "boolean") return null;
      return { t: "hit", nonce: m.nonce, target, x: m.x, y: m.y, hit: m.hit };
    case "tongue":
      if (!isNumber(m.angle) || !isNumber(m.length)) return null;
      return { t: "tongue", nonce: m.nonce, angle: m.angle, length: m.length };
    case "eat":
      if (!Array.isArray(m.bonusIds) || m.bonusIds.length > 10 || !m.bonusIds.every(isString)) return null;
      return { t: "eat", nonce: m.nonce, bonusIds: m.bonusIds as string[] };
    case "state": {
      const parsed = parseCoopState({ hostTime: m.hostTime, states: m.states });
      return parsed ? { t: "state", nonce: m.nonce, hostTime: parsed.hostTime, states: parsed.states } : null;
    }
    case "fire": {
      if (!isString(m.frame) || !isNumber(m.x) || !isNumber(m.y)) return null;
      const f = m.from as Record<string, unknown> | null | undefined;
      const from = f && typeof f === "object" && isNumber(f.x) && isNumber(f.y) && isNumber(f.z) ? { x: f.x, y: f.y, z: f.z } : null;
      return { t: "fire", nonce: m.nonce, frame: m.frame, x: m.x, y: m.y, from };
    }
    case "smash":
      if (!isString(m.frame) || !isNumber(m.x) || !isNumber(m.y) || !isNumberList(m.hits)) return null;
      return { t: "smash", nonce: m.nonce, frame: m.frame, hits: m.hits, x: m.x, y: m.y };
    case "lick":
      if (!isString(m.frame) || !isNumber(m.angle) || !isNumber(m.length)) return null;
      return { t: "lick", nonce: m.nonce, frame: m.frame, angle: m.angle, length: m.length };
    case "catch":
      if (!isString(m.frame) || !isNumberList(m.bonusIds) || !isNumberList(m.junkIds)) return null;
      return { t: "catch", nonce: m.nonce, frame: m.frame, bonusIds: m.bonusIds, junkIds: m.junkIds };
    case "ppstate": {
      const parsed = parsePingPongState({ hostTime: m.hostTime, state: m.state });
      return parsed ? { t: "ppstate", nonce: m.nonce, hostTime: parsed.hostTime, state: parsed.state } : null;
    }
    case "swing":
      if (!isNumber(m.flightId) || !isNumber(m.at)) return null;
      return { t: "swing", nonce: m.nonce, flightId: m.flightId, at: m.at, shot: m.shot === "lob" ? "lob" : "normal" };
    case "serve":
      if (!isNumber(m.at)) return null;
      return { t: "serve", nonce: m.nonce, at: m.at };
    default:
      return null;
  }
}

const isNumberList = (v: unknown): v is number[] => Array.isArray(v) && v.length <= 64 && v.every(isNumber);

/** Reads a signal fetched from the server, or null when malformed. */
export function parseSignal(raw: unknown): ArenaSignal | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Record<string, unknown>;
  if (!isString(s.session)) return null;
  if (s.type === "hello") return { type: "hello", session: s.session };
  if (s.type === "offer" && typeof s.sdp === "string") return { type: "offer", session: s.session, sdp: s.sdp };
  if (s.type === "answer" && typeof s.sdp === "string" && isString(s.target)) return { type: "answer", session: s.session, target: s.target, sdp: s.sdp };
  return null;
}

/** A short random id for a shot, a lick or a phone session. */
export function randomNonce(): string {
  const bytes = new Uint8Array(8);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Remembers the last `capacity` ids seen, to draw each egg or tongue once whatever the path it came by. */
export class NonceMemory {
  private readonly seen = new Set<string>();
  private readonly order: string[] = [];

  constructor(private readonly capacity = 256) {}

  has(nonce: string | undefined): boolean {
    return nonce !== undefined && this.seen.has(nonce);
  }

  /** Records the id; returns false when it was already known. */
  add(nonce: string | undefined): boolean {
    if (nonce === undefined) return true;
    if (this.seen.has(nonce)) return false;
    this.seen.add(nonce);
    this.order.push(nonce);
    if (this.order.length > this.capacity) this.seen.delete(this.order.shift()!);
    return true;
  }
}
