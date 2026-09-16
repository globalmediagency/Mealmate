import type { ArenaCollectionItem, ArenaEventView, ArenaMode, ArenaPlayerView, ArenaSnapshot, ArenaStakeView, ArenaStakesView, CoopResultStored, PingPongResultStored, ShotInput, ShotOutcome, TongueInput, TongueOutcome } from "@/lib/arena/service";
import { getAccessory } from "@/lib/accessories/catalog";
import { coopScore, parseCoopState, type CoopStateMessage } from "@/lib/game/coop";
import { parsePingPongState, pingpongScore, type PingPongStateMessage } from "@/lib/game/pingpong";
import { DEFAULT_RULES } from "@/lib/game/rules";
import { arenaScore, placeArenaBonus, rankArenaPlayers } from "@/lib/game/arena";
import { ARENA } from "@/lib/game/config";
import { playEffects } from "@/lib/game/play";
import { NO_LINK, type ArenaErrorListener, type ArenaListener, type ArenaTransport, type CoopAction, type LinkState, type LobbyMove } from "./transport";

/** The two players of the preview: the viewer (marker 17) and Léa (marker 42). */
export const PREVIEW_ME = "preview-me";
export const PREVIEW_OTHER = "preview-lea";
const MATCH_ID = "00000000-0000-4000-8000-000000000042";
const MAX_HP = 100;
const EGG_DAMAGE = 15;
const DURATION = 90;
/** What the viewer may bet in the preview lobby, and what Léa already bets. */
const PREVIEW_COLLECTION: Array<{ id: string; qty: number; equipped: boolean }> = [
  { id: "beret", qty: 1, equipped: true },
  { id: "straw_hat", qty: 2, equipped: false },
  { id: "scarf", qty: 1, equipped: false },
  { id: "monocle", qty: 1, equipped: false },
];
const OTHER_STAKES = ["bow_tie"];

type Player = ArenaPlayerView & { outAt: number | null };

const stakeView = (id: string): ArenaStakeView | null => {
  const accessory = getAccessory(id);
  return accessory ? { accessoryId: id, name: accessory.name, slot: accessory.slot, rarity: accessory.rarity } : null;
};

const collectionItems = (): ArenaCollectionItem[] => PREVIEW_COLLECTION.flatMap((c) => {
  const view = stakeView(c.id);
  return view ? [{ ...view, qty: c.qty, equipped: c.equipped }] : [];
});

const noStakes = (enabled: boolean, waitingFor: string[] = []): ArenaStakesView => ({ enabled, agreed: false, waitingFor, pot: 0, winnerId: null });

/** Which of the two the viewer plays: the viewer's own creature (marker 17) or Léa (marker 42), for the two-tab WebRTC dev screen. */
export type PreviewSide = "me" | "lea";

/** The two players, the viewer's row first. */
function basePlayers(side: PreviewSide = "me"): Player[] {
  const common = { hitsDealt: 0, hitsTaken: 0, shots: 0, goodEaten: 0, healed: 0, rank: null, eliminatedAt: null, outAt: null, hp: MAX_HP, stakes: [] as ArenaStakeView[], agreed: false, points: 0 };
  const miso: Player = {
    ...common,
    userId: PREVIEW_ME,
    username: side === "me" ? "Toi" : "Sam",
    creatureId: "c-preview-me",
    creatureName: "Miso",
    markerId: 17,
    creature: { name: "Miso", speciesId: "facile-panda-roux", stage: "adulte", state: "healthy", accessories: [{ slot: "head", id: "beret" }] },
    status: "ready",
    mine: side === "me",
    isHost: side === "me",
  };
  const lea: Player = {
    ...common,
    userId: PREVIEW_OTHER,
    username: side === "lea" ? "Toi" : "Léa",
    creatureId: "c-preview-lea",
    creatureName: "Pipo",
    markerId: 42,
    creature: {
      name: "Pipo",
      speciesId: "facile-cochon-dinde",
      stage: "adulte",
      state: "healthy",
      accessories: [
        { slot: "head", id: "nightcap" },
        { slot: "neck", id: "bow_tie" },
        { slot: "body", id: "butterfly_wings" },
      ],
    },
    status: "ready",
    mine: side === "lea",
    isHost: side === "lea",
  };
  return side === "me" ? [miso, lea] : [lea, miso];
}

/** The lobby the dev screen starts from (server-renderable data). */
export function previewArenaSnapshot(side: PreviewSide = "me", webrtc = false, mode: ArenaMode = "arena"): ArenaSnapshot {
  const now = new Date().toISOString();
  const players = basePlayers(side);
  return {
    match: {
      id: MATCH_ID,
      status: "lobby",
      hostId: players[0].userId,
      isHost: true,
      maxHp: MAX_HP,
      eggDamage: EGG_DAMAGE,
      durationSeconds: DURATION,
      startedAt: null,
      endsAt: null,
      finishedAt: null,
      secondsLeft: 0,
      webrtc,
      createdAt: now,
      mergedInto: null,
      mode,
      seed: 4242,
      defense: DEFAULT_RULES.defense,
      coop: mode === "coop" ? { live: null, liveAt: null, result: null } : null,
      pingpong: mode === "pingpong" ? { live: null, liveAt: null, result: null } : null,
      stakes: noStakes(mode !== "coop", mode !== "coop" ? ["toi", players[1].username] : []),
    },
    players,
    bonuses: [],
    events: [],
    cursor: 0,
    me: players[0],
    now,
    ...(mode !== "coop" ? { collection: collectionItems() } : {}),
  };
}

/**
 * An in-memory referee for the dev screen and the tests: Léa throws eggs at
 * the viewer's creature every few seconds, licks the good foods next to hers,
 * and the match ends on time or when a creature falls. Same snapshot shape
 * as the server, same rules.
 */
export class PreviewTransport implements ArenaTransport {
  readonly kind = "preview" as const;
  snapshot: ArenaSnapshot;
  private status: ArenaSnapshot["match"]["status"];
  private players: Player[];
  private bonuses: Array<ArenaSnapshot["bonuses"][number] & { eaten: boolean }> = [];
  private events: ArenaEventView[] = [];
  private nextEventId = 1;
  private emittedUpTo = 0;
  private startedAt: number | null = null;
  private endsAt: number | null = null;
  private finishedAt: number | null = null;
  private nextBonusAt = 0;
  private nextOtherShotAt = 0;
  private lastShotAt = -Infinity;
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly listeners = new Set<ArenaListener>();
  private readonly random: () => number;
  /** Coop: the host's published simulation and the team's result. */
  private coopLive: CoopStateMessage | null = null;
  private coopLiveAt: string | null = null;
  private coopResult: CoopResultStored | null = null;
  /** Ping-pong: the host's published rally state and the final score. */
  private pingpongLive: PingPongStateMessage | null = null;
  private pingpongResult: PingPongResultStored | null = null;
  /** Stakes (arena mode): the viewer's bets, Léa's, who validated the pot, when Léa validates it again. */
  private myStakes: string[] = [];
  private readonly otherStakes: string[];
  private agreed = { me: false, other: false };
  private otherAgreesAt: number | null = null;
  private stakesWinner: string | null = null;

  constructor(initial: ArenaSnapshot = previewArenaSnapshot(), random: () => number = Math.random) {
    this.snapshot = initial;
    this.status = initial.match.status;
    this.players = basePlayers(initial.me?.userId === PREVIEW_OTHER ? "lea" : "me");
    this.random = random;
    this.otherStakes = initial.match.stakes.enabled ? [...OTHER_STAKES] : [];
    this.syncStakes();
  }

  private get stakesEnabled(): boolean {
    return this.snapshot.match.stakes.enabled;
  }

  /** Copies the bets onto the players' rows. */
  private syncStakes() {
    this.me.stakes = this.myStakes.flatMap((id) => stakeView(id) ?? []);
    this.other.stakes = this.otherStakes.flatMap((id) => stakeView(id) ?? []);
    this.me.agreed = this.agreed.me;
    this.other.agreed = this.agreed.other;
  }

  private stakesView(): ArenaStakesView {
    if (!this.stakesEnabled) return noStakes(false);
    const waitingFor = this.status === "lobby" ? [...(this.agreed.me ? [] : ["toi"]), ...(this.agreed.other ? [] : [this.other.username])] : [];
    const pot = this.myStakes.length + this.otherStakes.length;
    return { enabled: true, agreed: waitingFor.length === 0, waitingFor, pot, winnerId: this.status === "finished" && pot > 0 ? this.stakesWinner : null };
  }

  /** The viewer's row, then the other's. */
  private get me(): Player {
    return this.players[0];
  }

  private get other(): Player {
    return this.players[1];
  }

  serverNow(): number {
    return Date.now();
  }

  linkState(): LinkState {
    return NO_LINK;
  }

  broadcast(): void {}

  subscribePeers(): () => void {
    return () => {};
  }

  /** Coop moves: the state is kept for the snapshot, a finish closes the battle with the team's score; relays are no-ops (nobody else here). */
  async coop(action: CoopAction): Promise<boolean> {
    if (this.status !== "playing") return false;
    if (action.action === "state" && this.snapshot.match.mode === "pingpong") {
      const parsed = parsePingPongState(action.state);
      if (!parsed) return false;
      this.pingpongLive = parsed;
      this.coopLiveAt = new Date().toISOString();
    } else if (action.action === "state") {
      const parsed = parseCoopState(action.state);
      if (!parsed) return false;
      this.coopLive = parsed;
      this.coopLiveAt = new Date().toISOString();
    } else if (action.action === "finish" && "points" in action) {
      const mine = action.points[this.me.userId] ?? 0;
      const theirs = action.points[this.other.userId] ?? 0;
      const winnerId = mine > theirs ? this.me.userId : theirs > mine ? this.other.userId : null;
      this.pingpongResult = { points: action.points, winnerId, longestRally: action.longestRally, hits: action.hits, perfects: action.perfects };
      this.stakesWinner = winnerId;
      this.status = "finished";
      this.finishedAt = Date.now();
      for (const p of this.players) {
        p.points = action.points[p.userId] ?? 0;
        p.rank = winnerId === null || p.userId === winnerId ? 1 : 2;
        if (p.mine) {
          const { score, perfect } = pingpongScore(mine, theirs, winnerId === null ? null : winnerId === p.userId);
          p.reward = { score, perfect, effects: playEffects(score), playsLeft: 2 };
        }
      }
      this.log(this.me.userId, "finish", { reason: "pingpong", points: action.points, winnerId });
      this.emit();
    } else if (action.action === "finish" && "summaries" in action) {
      const summaries = Object.values(action.summaries);
      this.coopResult = { ...coopScore(summaries, DEFAULT_RULES.defense), summaries: action.summaries };
      this.status = "finished";
      this.finishedAt = Date.now();
      for (const p of this.players) {
        p.rank = 1;
        if (p.mine) p.reward = { score: this.coopResult.score, perfect: this.coopResult.perfect, effects: playEffects(this.coopResult.score), playsLeft: 2 };
      }
      this.log(this.me.userId, "finish", { reason: "coop", score: this.coopResult.score });
      this.emit();
    }
    return true;
  }

  subscribe(listener: ArenaListener, onError?: ArenaErrorListener): () => void {
    void onError;
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), ARENA.pollMs);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private log(actorId: string | null, kind: string, payload: Record<string, unknown> = {}) {
    this.events.push({ id: this.nextEventId++, actorId, kind, payload, at: new Date().toISOString() });
  }

  private standing(): Player[] {
    return this.players.filter((p) => p.status === "ready" && p.hp > 0);
  }

  private finish(reason: "time" | "last_standing") {
    if (this.status !== "playing") return;
    const now = Date.now();
    this.status = "finished";
    this.finishedAt = reason === "time" && this.endsAt ? this.endsAt : now;
    const ranks = rankArenaPlayers(this.players.map((p) => ({ userId: p.userId, alive: p.status === "ready" && p.hp > 0, hp: p.hp, hitsDealt: p.hitsDealt, outAt: p.outAt })));
    const first = this.players.filter((p) => ranks.get(p.userId) === 1);
    this.stakesWinner = first.length === 1 ? first[0].userId : null;
    for (const p of this.players) {
      p.rank = ranks.get(p.userId) ?? null;
      if (p.mine) {
        if (p.status !== "ready") p.reward = { skipped: "left" };
        else {
          const { score, perfect } = arenaScore(p.hp, MAX_HP, p.rank ?? 2, this.players.length);
          p.reward = { score, perfect, effects: playEffects(score), playsLeft: 2 };
        }
      }
    }
    this.log(null, "finish", { reason });
  }

  private damage(target: Player, by: Player, x: number, y: number, nonce?: string): number {
    target.hp = Math.max(0, target.hp - EGG_DAMAGE);
    target.hitsTaken += 1;
    by.hitsDealt += 1;
    this.log(by.userId, "egg", { target: target.userId, x, y, hit: true, hp: target.hp, ...(nonce ? { nonce } : {}) });
    if (target.hp <= 0) {
      target.eliminatedAt = new Date().toISOString();
      target.outAt = Date.now();
      this.log(target.userId, "eliminated", { by: by.userId });
      if (this.standing().length <= 1) this.finish("last_standing");
    }
    return target.hp;
  }

  private tick() {
    const now = Date.now();
    if (this.status === "lobby" && this.otherAgreesAt !== null && now >= this.otherAgreesAt) {
      this.otherAgreesAt = null;
      this.agreed.other = true;
      this.syncStakes();
      this.log(this.other.userId, "agree");
    }
    if (this.status === "playing" && this.snapshot.match.mode !== "arena") {
      // Coop and ping-pong: the viewer's phone runs the game itself; nothing to simulate here.
    } else if (this.status === "playing") {
      if (this.endsAt !== null && now >= this.endsAt) this.finish("time");
      else {
        this.bonuses = this.bonuses.filter((b) => !b.eaten && Date.parse(b.expiresAt) > now);
        if (now >= this.nextBonusAt) {
          this.nextBonusAt = now + ARENA.bonusEverySeconds * 1000;
          if (this.bonuses.length < ARENA.maxBonuses) {
            const placement = placeArenaBonus(
              this.random,
              this.standing().map((p) => p.userId),
            );
            if (placement) this.bonuses.push({ id: `bonus-${this.nextEventId}-${Math.floor(this.random() * 1e6)}`, ...placement, expiresAt: new Date(now + ARENA.bonusStaySeconds * 1000).toISOString(), eaten: false });
          }
        }
        const other = this.other;
        const me = this.me;
        if (now >= this.nextOtherShotAt && other.hp > 0 && me.hp > 0) {
          this.nextOtherShotAt = now + 2000 + this.random() * 1500;
          other.shots += 1;
          const hit = this.random() < 0.45;
          const angle = this.random() * Math.PI * 2;
          const dist = hit ? this.random() * 0.4 : 0.7 + this.random() * 0.6;
          const x = Math.cos(angle) * dist;
          const y = Math.sin(angle) * dist;
          if (hit) this.damage(me, other, x, y);
          else this.log(other.userId, "egg", { target: me.userId, x, y, hit: false });
          const snack = this.bonuses.find((b) => !b.eaten && b.anchorUserId === other.userId);
          if (snack && this.random() < 0.6) {
            snack.eaten = true;
            const healed = Math.min(MAX_HP - other.hp, snack.heal);
            other.hp += healed;
            other.goodEaten += 1;
            other.healed += healed;
            this.log(other.userId, "tongue", { angle: Math.atan2(snack.y, snack.x), length: Math.max(1.2, Math.hypot(snack.x, snack.y)), bonusIds: [snack.id], healed, hp: other.hp });
          }
        }
      }
    }
    this.emit();
  }

  private toSnapshot(since: number): ArenaSnapshot {
    const now = Date.now();
    const players: ArenaPlayerView[] = this.players.map((p) => {
      const view: ArenaPlayerView = { ...p };
      if (!p.mine) delete view.reward;
      return view;
    });
    const events = this.events.filter((e) => e.id > since);
    return {
      match: {
        id: MATCH_ID,
        status: this.status,
        hostId: this.me.userId,
        isHost: true,
        maxHp: MAX_HP,
        eggDamage: EGG_DAMAGE,
        durationSeconds: DURATION,
        startedAt: this.startedAt ? new Date(this.startedAt).toISOString() : null,
        endsAt: this.endsAt ? new Date(this.endsAt).toISOString() : null,
        finishedAt: this.finishedAt ? new Date(this.finishedAt).toISOString() : null,
        secondsLeft: this.status === "playing" && this.endsAt ? Math.max(0, Math.ceil((this.endsAt - now) / 1000)) : 0,
        webrtc: this.snapshot.match.webrtc,
        createdAt: this.snapshot.match.createdAt,
        mergedInto: null,
        mode: this.snapshot.match.mode,
        seed: this.snapshot.match.seed,
        defense: this.snapshot.match.defense,
        coop: this.snapshot.match.mode === "coop" ? { live: this.coopLive, liveAt: this.coopLiveAt, result: this.coopResult } : null,
        pingpong: this.snapshot.match.mode === "pingpong" ? { live: this.pingpongLive, liveAt: this.coopLiveAt, result: this.pingpongResult } : null,
        stakes: this.stakesView(),
      },
      players,
      bonuses:
        this.status === "playing"
          ? this.bonuses
              .filter((b) => !b.eaten && Date.parse(b.expiresAt) > now)
              .map((b) => ({ id: b.id, anchorUserId: b.anchorUserId, kind: b.kind, x: b.x, y: b.y, heal: b.heal, expiresAt: b.expiresAt }))
          : [],
      events,
      cursor: events.length > 0 ? events[events.length - 1].id : since,
      me: players[0],
      now: new Date(now).toISOString(),
      ...(this.stakesEnabled && this.status === "lobby" ? { collection: collectionItems() } : {}),
    };
  }

  private emit(): ArenaSnapshot {
    const snapshot = this.toSnapshot(this.emittedUpTo);
    this.emittedUpTo = snapshot.cursor;
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener(snapshot);
    if (this.status === "finished" || this.status === "cancelled") this.stop();
    return snapshot;
  }

  async refresh(): Promise<ArenaSnapshot | null> {
    return this.emit();
  }

  async act(move: LobbyMove): Promise<ArenaSnapshot> {
    const now = Date.now();
    if (typeof move !== "string") {
      if (this.status !== "lobby" || !this.stakesEnabled) return this.emit();
      if (move.action === "stake") {
        const has = this.myStakes.includes(move.accessoryId);
        if (move.staked && !has && PREVIEW_COLLECTION.some((c) => c.id === move.accessoryId)) this.myStakes.push(move.accessoryId);
        else if (!move.staked && has) this.myStakes = this.myStakes.filter((id) => id !== move.accessoryId);
        else return this.emit();
        // The pot changed: everybody validates again (Léa does so by herself a moment after the viewer).
        this.agreed = { me: false, other: false };
        this.otherAgreesAt = null;
        this.log(this.me.userId, move.staked ? "stake" : "unstake", { accessoryId: move.accessoryId });
      } else if (move.action === "agree" && !this.agreed.me) {
        this.agreed.me = true;
        this.otherAgreesAt = now + 1500;
        this.log(this.me.userId, "agree");
      }
      this.syncStakes();
      return this.emit();
    }
    const action = move;
    if (action === "start" && this.status === "lobby" && this.stakesEnabled && !(this.agreed.me && this.agreed.other)) return this.emit();
    if (action === "start" && this.status === "lobby") {
      this.status = "playing";
      this.startedAt = now;
      this.endsAt = now + DURATION * 1000;
      this.nextBonusAt = now + ARENA.firstBonusSeconds * 1000;
      this.nextOtherShotAt = now + 2500;
      this.log(this.me.userId, "start", { endsAt: new Date(this.endsAt).toISOString() });
    } else if (action === "cancel" && this.status === "lobby") {
      this.status = "cancelled";
      this.finishedAt = now;
      this.log(this.me.userId, "cancel");
    } else if (action === "leave") {
      const me = this.me;
      if (this.status === "lobby") {
        this.status = "cancelled";
        this.finishedAt = now;
      } else if (this.status === "playing") {
        me.status = "left";
        me.outAt = now;
        me.eliminatedAt = new Date(now).toISOString();
        this.log(me.userId, "leave");
        this.finish("last_standing");
      }
    }
    return this.emit();
  }

  async shoot(input: ShotInput): Promise<ShotOutcome | null> {
    if (this.status !== "playing") return null;
    const now = Date.now();
    if (now - this.lastShotAt < ARENA.shotMinIntervalMs) return { accepted: false, hit: false, targetHp: null, eliminated: false };
    this.lastShotAt = now;
    const me = this.me;
    me.shots += 1;
    const target = input.targetUserId ? this.players.find((p) => p.userId === input.targetUserId && !p.mine) : undefined;
    if (!input.hit || !target || target.hp <= 0) {
      this.log(me.userId, "egg", { target: target?.userId ?? null, x: input.x, y: input.y, hit: false, ...(input.nonce ? { nonce: input.nonce } : {}) });
      return { accepted: true, hit: false, targetHp: target?.hp ?? null, eliminated: false };
    }
    const hp = this.damage(target, me, input.x, input.y, input.nonce);
    return { accepted: true, hit: true, targetHp: hp, eliminated: hp <= 0 };
  }

  async lick(input: TongueInput): Promise<TongueOutcome | null> {
    if (this.status !== "playing") return null;
    const me = this.me;
    const now = Date.now();
    const eaten: TongueOutcome["eaten"] = [];
    for (const id of input.bonusIds.slice(0, 3)) {
      const bonus = this.bonuses.find((b) => b.id === id && !b.eaten && Date.parse(b.expiresAt) > now);
      if (!bonus) continue;
      bonus.eaten = true;
      eaten.push({ id: bonus.id, kind: bonus.kind, heal: bonus.heal });
    }
    const heal = eaten.reduce((sum, b) => sum + b.heal, 0);
    const healed = Math.min(MAX_HP - me.hp, heal);
    me.hp += healed;
    me.goodEaten += eaten.length;
    me.healed += healed;
    this.log(me.userId, "tongue", { angle: input.angle, length: input.length, bonusIds: eaten.map((b) => b.id), healed, hp: me.hp, ...(input.nonce ? { nonce: input.nonce } : {}) });
    return { eaten, healed, hp: me.hp };
  }
}
