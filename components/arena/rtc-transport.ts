import type { ArenaEventView, ArenaSnapshot, ShotInput, ShotOutcome, TongueInput, TongueOutcome } from "@/lib/arena/service";
import { isOfferer, parsePeerMessage, parseSignal, randomNonce, type ArenaSignal, type PeerMessage } from "@/lib/arena/rtc-protocol";
import { ARENA } from "@/lib/game/config";
import type { ArenaErrorListener, ArenaListener, ArenaTransport, LinkState, LobbyAction, PeerListener } from "./transport";

/** A signal fetched for this phone. */
export type SignalEnvelope = { id: number; from: string; payload: unknown };

/** How the signals (offers, answers, hellos) reach the other phones: through the server, or a page channel in the dev screens. */
export interface Signaling {
  send(to: string, signal: ArenaSignal): Promise<void>;
  poll(since: number): Promise<{ signals: SignalEnvelope[]; cursor: number }>;
  /** Extra ICE servers for this match (a TURN relay with short-lived credentials), when the server has some. */
  iceServers?(): Promise<RTCIceServer[]>;
  close(): void;
}

/** Waiting longer than this for the relay credentials would delay the link more than the relay saves. */
const ICE_SERVERS_TIMEOUT_MS = 4000;

/** Signals through `/api/arena/:id/signals` (spec § 3.22). */
export class HttpSignaling implements Signaling {
  constructor(private readonly matchId: string) {}

  async send(to: string, signal: ArenaSignal): Promise<void> {
    const response = await fetch(`/api/arena/${this.matchId}/signals`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to, ...signal }),
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`signal ${response.status}`);
  }

  async poll(since: number): Promise<{ signals: SignalEnvelope[]; cursor: number }> {
    const response = await fetch(`/api/arena/${this.matchId}/signals?since=${since}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`signals ${response.status}`);
    return (await response.json()) as { signals: SignalEnvelope[]; cursor: number };
  }

  /** `GET /api/arena/:id/ice`: the Cloudflare TURN relay when configured, otherwise nothing (public STUN stays). */
  async iceServers(): Promise<RTCIceServer[]> {
    const response = await fetch(`/api/arena/${this.matchId}/ice`, { cache: "no-store" });
    if (!response.ok) throw new Error(`ice ${response.status}`);
    const body = (await response.json()) as { iceServers?: RTCIceServer[] };
    return Array.isArray(body.iceServers) ? body.iceServers : [];
  }

  close(): void {}
}

/** Signals over a `BroadcastChannel` of the page's origin: two tabs of the dev screen link to each other for real. */
export class ChannelSignaling implements Signaling {
  private readonly channel: BroadcastChannel | null;
  private readonly queue: SignalEnvelope[] = [];
  private nextId = 1;

  constructor(
    matchId: string,
    private readonly me: string,
  ) {
    this.channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(`mealmate-arena-${matchId}`);
    if (this.channel) {
      this.channel.onmessage = (event: MessageEvent<{ from: string; to: string; payload: unknown }>) => {
        const data = event.data;
        if (!data || data.to !== this.me || data.from === this.me) return;
        this.queue.push({ id: this.nextId++, from: data.from, payload: data.payload });
      };
    }
  }

  async send(to: string, signal: ArenaSignal): Promise<void> {
    this.channel?.postMessage({ from: this.me, to, payload: signal });
  }

  async poll(): Promise<{ signals: SignalEnvelope[]; cursor: number }> {
    const signals = this.queue.splice(0, this.queue.length);
    return { signals, cursor: 0 };
  }

  close(): void {
    this.channel?.close();
  }
}

type PeerState = "idle" | "connecting" | "connected" | "failed";

type Peer = {
  userId: string;
  pc: RTCPeerConnection | null;
  channel: RTCDataChannel | null;
  /** The other phone's session, as last heard. */
  session: string | null;
  state: PeerState;
  /** When the current attempt started (ms). */
  attemptAt: number;
  /** When this phone last said hello (non-offerer side). */
  helloAt: number;
};

/** An attempt older than this is considered stuck: a new hello or offer replaces it. */
const STALE_ATTEMPT_MS = 6000;

function waitForIce(pc: RTCPeerConnection, timeoutMs: number): Promise<void> {
  if (pc.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(done, timeoutMs);
    function done() {
      clearTimeout(timer);
      pc.removeEventListener("icegatheringstatechange", check);
      resolve();
    }
    function check() {
      if (pc.iceGatheringState === "complete") done();
    }
    pc.addEventListener("icegatheringstatechange", check);
  });
}

/**
 * The direct link between the phones of a match (spec § 3.22): one WebRTC
 * data channel per pair (full mesh, 2 to 4 players), opened through signals
 * relayed by the server (no trickle: each offer and answer carries its ICE
 * candidates). The referee stays the server, polled by `inner`; the link
 * only carries eggs and tongues so the others see them at once. A pair that
 * cannot connect (mobile networks without a path) keeps the polling.
 */
export class RtcTransport implements ArenaTransport {
  readonly kind = "webrtc" as const;
  private readonly peers = new Map<string, Peer>();
  private readonly session = randomNonce();
  private signalCursor: number;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private polling = false;
  private unsubscribe: (() => void) | null = null;
  private readonly peerListeners = new Set<PeerListener>();
  /** Public STUN, plus the relay's servers once fetched. */
  private iceServers: RTCIceServer[] = ARENA.rtc.iceServers.map((urls) => ({ urls }));
  private relay = false;

  constructor(
    private readonly inner: ArenaTransport,
    private readonly me: string,
    private readonly signaling: Signaling,
    signalCursor = 0,
  ) {
    this.signalCursor = signalCursor;
  }

  /** Whether a TURN relay backs the link (for the HUD and the tests). */
  get hasRelay(): boolean {
    return this.relay;
  }

  get snapshot(): ArenaSnapshot | null {
    return this.inner.snapshot;
  }

  serverNow(): number {
    return this.inner.serverNow();
  }

  subscribe(listener: ArenaListener, onError?: ArenaErrorListener): () => void {
    return this.inner.subscribe(listener, onError);
  }

  refresh(): Promise<ArenaSnapshot | null> {
    return this.inner.refresh();
  }

  async act(action: LobbyAction): Promise<ArenaSnapshot> {
    const snapshot = await this.inner.act(action);
    this.syncPeers(snapshot);
    return snapshot;
  }

  shoot(input: ShotInput): Promise<ShotOutcome | null> {
    return this.inner.shoot(input);
  }

  lick(input: TongueInput): Promise<TongueOutcome | null> {
    return this.inner.lick(input);
  }

  linkState(): LinkState {
    let connected = 0;
    for (const peer of this.peers.values()) if (peer.state === "connected") connected += 1;
    return { mode: "webrtc", connected, total: this.peers.size };
  }

  broadcast(message: PeerMessage): void {
    const raw = JSON.stringify(message);
    for (const peer of this.peers.values()) {
      if (peer.state !== "connected" || !peer.channel || peer.channel.readyState !== "open") continue;
      try {
        peer.channel.send(raw);
      } catch (error) {
        console.warn("[arena] peer send failed", error);
      }
    }
  }

  subscribePeers(listener: PeerListener): () => void {
    this.peerListeners.add(listener);
    return () => this.peerListeners.delete(listener);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.inner.start();
    void this.prepare().then(() => {
      if (!this.running) return;
      this.unsubscribe = this.inner.subscribe((snapshot) => this.syncPeers(snapshot));
      if (this.inner.snapshot) this.syncPeers(this.inner.snapshot);
      this.schedule(0);
    });
  }

  /** Fetches the relay's credentials first (bounded wait): the connections opened afterwards can use it. */
  private async prepare(): Promise<void> {
    if (!this.signaling.iceServers) return;
    try {
      const extra = await Promise.race([
        this.signaling.iceServers(),
        new Promise<RTCIceServer[]>((resolve) => setTimeout(() => resolve([]), ICE_SERVERS_TIMEOUT_MS)),
      ]);
      if (extra.length > 0) {
        this.iceServers = [...this.iceServers, ...extra];
        this.relay = extra.some((server) => (Array.isArray(server.urls) ? server.urls : [server.urls]).some((url) => url.startsWith("turn")));
      }
    } catch (error) {
      console.warn("[arena] relay credentials unavailable, STUN only", error);
    }
  }

  stop(): void {
    this.running = false;
    this.unsubscribe?.();
    this.unsubscribe = null;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.closeAll();
    this.signaling.close();
    this.inner.stop();
  }

  private closeAll() {
    for (const peer of this.peers.values()) this.closePeer(peer);
    this.peers.clear();
  }

  private closePeer(peer: Peer) {
    peer.channel?.close();
    peer.pc?.close();
    peer.channel = null;
    peer.pc = null;
    peer.state = "idle";
  }

  /** Follows the players of the match: a new ready player becomes a peer to link with. */
  private syncPeers(snapshot: ArenaSnapshot) {
    if (snapshot.match.status === "finished" || snapshot.match.status === "cancelled") {
      this.closeAll();
      return;
    }
    for (const player of snapshot.players) {
      if (player.userId === this.me || player.status !== "ready" || this.peers.has(player.userId)) continue;
      const peer: Peer = { userId: player.userId, pc: null, channel: null, session: null, state: "idle", attemptAt: 0, helloAt: 0 };
      this.peers.set(player.userId, peer);
      if (isOfferer(this.me, peer.userId)) void this.offerTo(peer);
      else void this.hello(peer);
    }
    for (const [userId, peer] of this.peers) {
      const player = snapshot.players.find((p) => p.userId === userId);
      if (!player || player.status !== "ready") {
        this.closePeer(peer);
        this.peers.delete(userId);
      }
    }
  }

  private allLinked(): boolean {
    for (const peer of this.peers.values()) if (peer.state !== "connected") return false;
    return true;
  }

  private schedule(delay?: number) {
    if (!this.running || this.timer) return;
    const status = this.inner.snapshot?.match.status;
    if (status === "finished" || status === "cancelled") return;
    this.timer = setTimeout(
      () => {
        this.timer = null;
        void this.pollSignals().finally(() => this.schedule());
      },
      delay ?? (this.allLinked() ? ARENA.rtc.signalIdlePollMs : ARENA.rtc.signalPollMs),
    );
  }

  private async pollSignals(): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    try {
      const { signals, cursor } = await this.signaling.poll(this.signalCursor);
      this.signalCursor = cursor;
      for (const envelope of signals) {
        const signal = parseSignal(envelope.payload);
        if (signal) await this.handleSignal(envelope.from, signal);
      }
      this.retryStuck();
    } catch (error) {
      console.warn("[arena] signalling failed", error);
    } finally {
      this.polling = false;
    }
  }

  /** A non-offerer whose peer is still missing says hello again; a stuck attempt is given up (the polling covers it). */
  private retryStuck() {
    const now = Date.now();
    for (const peer of this.peers.values()) {
      if (peer.state === "connected") continue;
      if (peer.state === "connecting" && now - peer.attemptAt > ARENA.rtc.connectTimeoutMs) {
        this.closePeer(peer);
        peer.state = "failed";
      }
      if (!isOfferer(this.me, peer.userId) && now - peer.helloAt > STALE_ATTEMPT_MS && peer.state !== "connecting") void this.hello(peer);
    }
  }

  private async handleSignal(from: string, signal: ArenaSignal): Promise<void> {
    const peer = this.peers.get(from);
    if (!peer) return;
    const offerer = isOfferer(this.me, from);
    try {
      if (signal.type === "hello") {
        if (!offerer) return;
        const fresh = peer.session !== signal.session;
        const stuck = peer.state === "connecting" && Date.now() - peer.attemptAt > STALE_ATTEMPT_MS;
        if (fresh || peer.state === "idle" || peer.state === "failed" || stuck) {
          peer.session = signal.session;
          await this.offerTo(peer);
        }
      } else if (signal.type === "offer") {
        if (offerer) return;
        if (peer.session === signal.session && peer.state === "connected") return;
        peer.session = signal.session;
        await this.answer(peer, signal);
      } else if (signal.type === "answer") {
        if (!offerer || signal.target !== this.session || !peer.pc || peer.pc.signalingState !== "have-local-offer") return;
        peer.session = signal.session;
        await peer.pc.setRemoteDescription({ type: "answer", sdp: signal.sdp });
      }
    } catch (error) {
      console.warn("[arena] signal handling failed", error);
      peer.state = "failed";
    }
  }

  private newConnection(peer: Peer, initiator: boolean): RTCPeerConnection {
    this.closePeer(peer);
    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
    peer.pc = pc;
    peer.state = "connecting";
    peer.attemptAt = Date.now();
    if (initiator) this.attachChannel(peer, pc.createDataChannel("arena", { ordered: true }));
    else pc.ondatachannel = (event) => this.attachChannel(peer, event.channel);
    pc.onconnectionstatechange = () => {
      if (peer.pc !== pc) return;
      if (pc.connectionState === "failed" || pc.connectionState === "closed") peer.state = "failed";
      else if (pc.connectionState === "disconnected" && peer.state === "connected") peer.state = "failed";
    };
    return pc;
  }

  private attachChannel(peer: Peer, channel: RTCDataChannel) {
    peer.channel = channel;
    channel.onopen = () => {
      if (peer.channel === channel) peer.state = "connected";
    };
    channel.onclose = () => {
      if (peer.channel === channel && peer.state === "connected") peer.state = "failed";
    };
    channel.onmessage = (event: MessageEvent) => {
      const message = parsePeerMessage(event.data);
      if (!message) return;
      const view: ArenaEventView = { id: 0, actorId: peer.userId, kind: message.t, payload: message, at: new Date().toISOString() };
      for (const listener of this.peerListeners) listener(view);
    };
  }

  private async offerTo(peer: Peer): Promise<void> {
    const pc = this.newConnection(peer, true);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await waitForIce(pc, ARENA.rtc.gatherTimeoutMs);
    if (peer.pc !== pc || !pc.localDescription) return;
    await this.signaling.send(peer.userId, { type: "offer", session: this.session, sdp: pc.localDescription.sdp });
  }

  private async answer(peer: Peer, signal: Extract<ArenaSignal, { type: "offer" }>): Promise<void> {
    const pc = this.newConnection(peer, false);
    await pc.setRemoteDescription({ type: "offer", sdp: signal.sdp });
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await waitForIce(pc, ARENA.rtc.gatherTimeoutMs);
    if (peer.pc !== pc || !pc.localDescription) return;
    await this.signaling.send(peer.userId, { type: "answer", session: this.session, target: signal.session, sdp: pc.localDescription.sdp });
  }

  private async hello(peer: Peer): Promise<void> {
    peer.helloAt = Date.now();
    await this.signaling.send(peer.userId, { type: "hello", session: this.session });
  }
}
