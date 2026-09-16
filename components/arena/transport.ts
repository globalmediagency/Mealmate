import type { ArenaEventView, ArenaPlayerView, ArenaSnapshot, ShotInput, ShotOutcome, TongueInput, TongueOutcome } from "@/lib/arena/service";
import type { PeerMessage } from "@/lib/arena/rtc-protocol";
import { ARENA } from "@/lib/game/config";

export type LobbyAction = "join" | "decline" | "start" | "leave" | "cancel";
export type ArenaListener = (snapshot: ArenaSnapshot) => void;
export type ArenaErrorListener = (message: string) => void;
/** A message from another phone over the direct link, shaped like a server event (`id` 0, `payload` = the message). */
export type PeerListener = (event: ArenaEventView) => void;

export type LinkState = {
  /** `polling`: the server relays everything; `webrtc`: the phones also talk to each other. */
  mode: "polling" | "webrtc";
  /** Peers linked directly, out of the other players of the match (0/0 in polling mode). */
  connected: number;
  total: number;
};

/**
 * How a phone stays in sync with a match (spec § 3.22). The server is always
 * the referee, polled for the truth (health, bonuses, end). When the admin
 * enables it (`rules.arena.webrtc`), `RtcTransport` adds a direct WebRTC link
 * between the phones that carries the eggs and tongues without waiting for
 * the next poll, and slows the polling down; without it, or when the link
 * cannot be opened, plain `PollingTransport` does everything. Every
 * implementation hands complete snapshots to its listeners (players carry
 * their creatures) and only the events that are new.
 */
export interface ArenaTransport {
  readonly kind: "polling" | "preview" | "webrtc";
  /** Latest complete snapshot. */
  readonly snapshot: ArenaSnapshot | null;
  /** The server's clock now (ms), from the last snapshot. */
  serverNow(): number;
  subscribe(listener: ArenaListener, onError?: ArenaErrorListener): () => void;
  /** Starts following the match; stops by itself once it is over. */
  start(): void;
  stop(): void;
  /** Asks for a fresh complete snapshot right away. */
  refresh(): Promise<ArenaSnapshot | null>;
  act(action: LobbyAction): Promise<ArenaSnapshot>;
  shoot(input: ShotInput): Promise<ShotOutcome | null>;
  lick(input: TongueInput): Promise<TongueOutcome | null>;
  /** The direct link, when there is one. */
  linkState(): LinkState;
  /** Tells the other phones right away (no-op without a direct link). */
  broadcast(message: PeerMessage): void;
  /** Messages of the other phones over the direct link (never called without one). */
  subscribePeers(listener: PeerListener): () => void;
}

export const NO_LINK: LinkState = { mode: "polling", connected: 0, total: 0 };

/** A snapshot with every player carrying their creature: incremental ones borrow it from the previous complete one. */
export function completeSnapshot(incoming: ArenaSnapshot, previous: ArenaSnapshot | null): ArenaSnapshot {
  if (!previous) return incoming;
  const known = new Map(previous.players.map((p) => [p.userId, p]));
  const players: ArenaPlayerView[] = incoming.players.map((p) => {
    const before = known.get(p.userId);
    if (p.creature !== undefined || !before) return p;
    return { ...p, creature: before.creature, creatureName: p.creatureName ?? before.creatureName };
  });
  const me = players.find((p) => p.mine) ?? incoming.me;
  return { ...incoming, players, me };
}

export class ArenaRequestError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ArenaRequestError";
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) }, cache: "no-store" });
  const body = (await response.json().catch(() => null)) as T | { error: { code: string; message: string } } | null;
  if (!response.ok || !body || (typeof body === "object" && "error" in body)) {
    const error = body && typeof body === "object" && "error" in body ? body.error : { code: "network", message: "Impossible de joindre le serveur." };
    throw new ArenaRequestError(error.code, error.message);
  }
  return body;
}

/** Short polling: the pace follows the match (slow in the lobby, fast in the battle, over when it is finished). */
export class PollingTransport implements ArenaTransport {
  readonly kind = "polling" as const;
  snapshot: ArenaSnapshot | null;
  private cursor: number | null;
  private offset = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inFlight = false;
  private running = false;
  private failures = 0;
  private readonly listeners = new Set<ArenaListener>();
  private readonly errorListeners = new Set<ArenaErrorListener>();

  private readonly playingPollMs: number;

  constructor(
    private readonly matchId: string,
    initial: ArenaSnapshot | null = null,
    options: { playingPollMs?: number } = {},
  ) {
    this.snapshot = initial;
    this.cursor = initial?.cursor ?? null;
    this.playingPollMs = options.playingPollMs ?? ARENA.pollMs;
    if (initial) this.offset = Date.parse(initial.now) - Date.now();
  }

  serverNow(): number {
    return Date.now() + this.offset;
  }

  linkState(): LinkState {
    return NO_LINK;
  }

  broadcast(): void {}

  subscribePeers(): () => void {
    return () => {};
  }

  subscribe(listener: ArenaListener, onError?: ArenaErrorListener): () => void {
    this.listeners.add(listener);
    if (onError) this.errorListeners.add(onError);
    return () => {
      this.listeners.delete(listener);
      if (onError) this.errorListeners.delete(onError);
    };
  }

  private accept(incoming: ArenaSnapshot): ArenaSnapshot {
    const complete = completeSnapshot(incoming, this.snapshot);
    this.snapshot = complete;
    this.cursor = complete.cursor;
    this.offset = Date.parse(complete.now) - Date.now();
    this.failures = 0;
    for (const listener of this.listeners) listener(complete);
    return complete;
  }

  private delay(): number | null {
    const status = this.snapshot?.match.status;
    if (status === "finished" || status === "cancelled") return null;
    const base = status === "playing" ? this.playingPollMs : ARENA.lobbyPollMs;
    return Math.min(5000, base * 2 ** Math.min(4, this.failures));
  }

  private schedule() {
    if (!this.running || this.timer) return;
    const delay = this.delay();
    if (delay === null) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.poll().finally(() => this.schedule());
    }, delay);
  }

  private async poll(): Promise<void> {
    if (this.inFlight) return;
    this.inFlight = true;
    try {
      const url = this.cursor === null ? `/api/arena/${this.matchId}` : `/api/arena/${this.matchId}?since=${this.cursor}`;
      this.accept(await request<ArenaSnapshot>(url));
    } catch (error) {
      this.failures += 1;
      const message = error instanceof ArenaRequestError ? error.message : "Connexion perdue, nouvel essai…";
      for (const listener of this.errorListeners) listener(message);
    } finally {
      this.inFlight = false;
    }
  }

  start() {
    if (this.running) return;
    this.running = true;
    void this.poll().finally(() => this.schedule());
  }

  stop() {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  /** Polls now instead of waiting for the next tick. */
  private bump() {
    if (!this.running) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    void this.poll().finally(() => this.schedule());
  }

  async refresh(): Promise<ArenaSnapshot | null> {
    try {
      return this.accept(await request<ArenaSnapshot>(`/api/arena/${this.matchId}`));
    } catch (error) {
      const message = error instanceof ArenaRequestError ? error.message : "Impossible de joindre le serveur.";
      for (const listener of this.errorListeners) listener(message);
      return null;
    }
  }

  async act(action: LobbyAction): Promise<ArenaSnapshot> {
    const snapshot = await request<ArenaSnapshot>(`/api/arena/${this.matchId}/action`, { method: "POST", body: JSON.stringify({ action }) });
    const accepted = this.accept(snapshot);
    this.schedule();
    return accepted;
  }

  async shoot(input: ShotInput): Promise<ShotOutcome | null> {
    try {
      const outcome = await request<ShotOutcome>(`/api/arena/${this.matchId}/action`, { method: "POST", body: JSON.stringify({ action: "shoot", ...input }) });
      if (outcome.hit) this.bump();
      return outcome;
    } catch {
      return null;
    }
  }

  async lick(input: TongueInput): Promise<TongueOutcome | null> {
    try {
      const outcome = await request<TongueOutcome>(`/api/arena/${this.matchId}/action`, { method: "POST", body: JSON.stringify({ action: "eat", ...input }) });
      if (outcome.eaten.length > 0) this.bump();
      return outcome;
    } catch {
      return null;
    }
  }
}

/**
 * The transport for a match: plain polling, or, when the admin enabled it
 * (`rules.arena.webrtc`) and the browser can do WebRTC, the direct link on
 * top of a slower polling. The link is loaded on demand.
 */
export function createArenaTransport(matchId: string, initial: ArenaSnapshot | null, options: { webrtc?: boolean; userId?: string } = {}): ArenaTransport {
  if (options.webrtc && options.userId && typeof RTCPeerConnection !== "undefined") {
    return new LazyRtcTransport(matchId, initial, options.userId);
  }
  if (options.webrtc) console.info("[arena] WebRTC sync enabled by the admin but unavailable here: using short polling.");
  return new PollingTransport(matchId, initial);
}

/** The WebRTC transport, with its module loaded only when a match starts in that mode. */
class LazyRtcTransport implements ArenaTransport {
  readonly kind = "webrtc" as const;
  private inner: ArenaTransport;
  private link: ArenaTransport | null = null;
  private started = false;
  private readonly peerListeners = new Set<PeerListener>();
  private readonly unsubscribers: Array<() => void> = [];

  constructor(
    private readonly matchId: string,
    initial: ArenaSnapshot | null,
    private readonly userId: string,
  ) {
    this.inner = new PollingTransport(matchId, initial, { playingPollMs: ARENA.rtc.pollMs });
  }

  get snapshot(): ArenaSnapshot | null {
    return (this.link ?? this.inner).snapshot;
  }

  serverNow(): number {
    return this.inner.serverNow();
  }

  subscribe(listener: ArenaListener, onError?: ArenaErrorListener): () => void {
    return this.inner.subscribe(listener, onError);
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.inner.start();
    void import("./rtc-transport").then(({ RtcTransport, HttpSignaling }) => {
      if (!this.started) return;
      const link = new RtcTransport(this.inner, this.userId, new HttpSignaling(this.matchId), this.inner.snapshot?.cursor ?? 0);
      this.link = link;
      for (const listener of this.peerListeners) this.unsubscribers.push(link.subscribePeers(listener));
      link.start();
    });
  }

  stop(): void {
    this.started = false;
    for (const off of this.unsubscribers) off();
    this.unsubscribers.length = 0;
    this.link?.stop();
    this.link = null;
    this.inner.stop();
  }

  refresh(): Promise<ArenaSnapshot | null> {
    return this.inner.refresh();
  }

  act(action: LobbyAction): Promise<ArenaSnapshot> {
    return (this.link ?? this.inner).act(action);
  }

  shoot(input: ShotInput): Promise<ShotOutcome | null> {
    return this.inner.shoot(input);
  }

  lick(input: TongueInput): Promise<TongueOutcome | null> {
    return this.inner.lick(input);
  }

  linkState(): LinkState {
    return this.link?.linkState() ?? { mode: "webrtc", connected: 0, total: 0 };
  }

  broadcast(message: PeerMessage): void {
    this.link?.broadcast(message);
  }

  subscribePeers(listener: PeerListener): () => void {
    this.peerListeners.add(listener);
    const off = this.link?.subscribePeers(listener);
    return () => {
      this.peerListeners.delete(listener);
      off?.();
    };
  }
}
