import type { ArenaPlayerView, ArenaSnapshot, ShotInput, ShotOutcome, TongueInput, TongueOutcome } from "@/lib/arena/service";
import { ARENA } from "@/lib/game/config";

export type LobbyAction = "join" | "decline" | "start" | "leave" | "cancel";
export type ArenaListener = (snapshot: ArenaSnapshot) => void;
export type ArenaErrorListener = (message: string) => void;

/**
 * How a phone stays in sync with a match (spec § 3.22). Today: short polling
 * of the server, the referee. Later: a WebRTC link between the phones, chosen
 * by the admin (`rules.arena.webrtc`); until it exists the phones fall back
 * to polling whatever the setting says. Every implementation hands complete
 * snapshots to its listeners (players carry their creatures) and only the
 * events that are new.
 */
export interface ArenaTransport {
  readonly kind: "polling" | "preview";
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
}

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

  constructor(
    private readonly matchId: string,
    initial: ArenaSnapshot | null = null,
  ) {
    this.snapshot = initial;
    this.cursor = initial?.cursor ?? null;
    if (initial) this.offset = Date.parse(initial.now) - Date.now();
  }

  serverNow(): number {
    return Date.now() + this.offset;
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
    const base = status === "playing" ? ARENA.pollMs : ARENA.lobbyPollMs;
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
 * The transport for a match. `webrtc` is the admin's wish (`rules.arena.webrtc`):
 * the direct link between phones is not built yet, so polling is used either
 * way and the wish is only logged.
 */
export function createArenaTransport(matchId: string, initial: ArenaSnapshot | null, options: { webrtc?: boolean } = {}): ArenaTransport {
  if (options.webrtc) console.info("[arena] WebRTC sync requested by the admin: not available yet, using short polling.");
  return new PollingTransport(matchId, initial);
}
