"use client";

import { Crown, Trophy } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button, LinkButton } from "@/components/ui/button";
import { Card, CardText, CardTitle } from "@/components/ui/card";
import type { ArenaPlayerView, ArenaSnapshot } from "@/lib/arena/service";
import { cn } from "@/lib/utils/cn";
import { ArenaGame } from "./arena-game";
import { PreviewTransport } from "./preview-transport";
import { ChannelSignaling, RtcTransport } from "./rtc-transport";
import { ArenaRequestError, createArenaTransport, type ArenaTransport, type LobbyAction } from "./transport";

export type ArenaMatchProps = {
  initial: ArenaSnapshot;
  /** The admin's transport wish (`rules.arena.webrtc`); polling is used until WebRTC exists. */
  webrtc: boolean;
  /** Dev screens: an in-memory referee instead of the server. */
  preview?: boolean;
  /** Dev screens: a real WebRTC link between two tabs of the page (signals over a `BroadcastChannel`), each with its own referee. */
  previewRtc?: boolean;
};

const STATUS_LABEL: Record<ArenaPlayerView["status"], string> = { ready: "Prêt", invited: "Invité", declined: "A décliné", left: "Parti" };

const SKIPPED_LABEL: Record<string, string> = {
  left: "Partie quittée en route : pas de récompense cette fois.",
  play_limit: "Plus de partie disponible aujourd'hui : la bataille ne rapporte rien, mais elle a compté !",
  no_creature: "Ta créature n'est plus là pour recevoir la récompense.",
  absent: "Tu n'as pas pris part à la bataille.",
};

function rankLabel(rank: number | null): string {
  if (rank === null) return "—";
  return rank === 1 ? "1er" : `${rank}e`;
}

/**
 * A match from the lobby to the results (spec § 3.22): the players, the
 * host's start, the battle itself (`ArenaGame`) and the ranking with the
 * reader's reward. One transport per match, shared with the game.
 */
export function ArenaMatch({ initial, webrtc, preview = false, previewRtc = false }: ArenaMatchProps) {
  const router = useRouter();
  const transportRef = useRef<ArenaTransport | null>(null);
  if (!transportRef.current) {
    const userId = initial.me?.userId;
    if (preview && previewRtc && userId) transportRef.current = new RtcTransport(new PreviewTransport(initial), userId, new ChannelSignaling(initial.match.id, userId));
    else if (preview) transportRef.current = new PreviewTransport(initial);
    else transportRef.current = createArenaTransport(initial.match.id, initial, { webrtc, userId });
  }
  const transport = transportRef.current;
  const [snapshot, setSnapshot] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<LobbyAction | null>(null);
  const refreshed = useRef(false);

  useEffect(() => {
    const unsubscribe = transport.subscribe(
      (next) => {
        setError(null);
        // During the battle the game reads the transport itself: this component only re-renders on a status change.
        setSnapshot((prev) => (prev.match.status === "playing" && next.match.status === "playing" ? prev : next));
      },
      (message) => setError(message),
    );
    transport.start();
    return () => {
      unsubscribe();
      transport.stop();
    };
  }, [transport]);

  useEffect(() => {
    if (snapshot.match.status === "finished" && !refreshed.current && !preview) {
      refreshed.current = true;
      router.refresh();
    }
  }, [snapshot.match.status, preview, router]);

  async function act(action: LobbyAction) {
    setBusy(action);
    setError(null);
    try {
      setSnapshot(await transport.act(action));
    } catch (err) {
      setError(err instanceof ArenaRequestError ? err.message : "Impossible de joindre le serveur.");
    } finally {
      setBusy(null);
    }
  }

  const { match, players, me } = snapshot;
  const ready = players.filter((p) => p.status === "ready");
  const canStart = match.isHost && match.status === "lobby" && ready.length >= 2;
  const inGame = me?.status === "ready" && (match.status === "lobby" || match.status === "playing");
  const ranked = [...players].filter((p) => p.status === "ready" || p.status === "left").sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
  const reward = me?.reward ?? null;

  return (
    <div className="space-y-4 animate-rise" data-arena-match data-status={match.status}>
      <header>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-cream-50">Arène</h1>
        <p className="mt-0.5 text-sm text-cream-500">
          {match.status === "lobby"
            ? `${ready.length} joueur${ready.length > 1 ? "s" : ""} prêt${ready.length > 1 ? "s" : ""} · ${match.durationSeconds} s de bataille, ${match.maxHp} points de vie chacun.`
            : match.status === "playing"
              ? "Vise les créatures adverses, attrape les bons aliments avec la langue."
              : match.status === "finished"
                ? "La bataille est terminée."
                : "Cette partie a été annulée."}
        </p>
      </header>

      {error ? <Alert tone="danger">{error}</Alert> : null}

      {match.status === "lobby" ? (
        <Card>
          <CardTitle>Joueurs</CardTitle>
          <ul className="mt-2 divide-y divide-ink-600/80" data-arena-players>
            {players.map((p) => (
              <li key={p.userId} className="flex min-h-11 items-center justify-between gap-3 py-2 text-sm">
                <span className="flex items-center gap-2 text-cream-100">
                  {p.isHost ? <Crown className="h-4 w-4 text-brass-300" aria-label="Hôte" /> : null}
                  <span className="font-semibold">{p.mine ? "Toi" : p.username}</span>
                  <span className="text-cream-500">· {p.creatureName ?? "sa créature"}</span>
                </span>
                <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", p.status === "ready" ? "bg-sage-700/50 text-sage-100" : p.status === "invited" ? "bg-ink-700 text-cream-300" : "bg-ink-700 text-cream-600")}>
                  {STATUS_LABEL[p.status]}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            {me?.status === "invited" ? (
              <>
                <Button onClick={() => void act("join")} disabled={busy !== null} variant="brass" className="w-auto px-6">
                  {busy === "join" ? "Un instant…" : "Rejoindre"}
                </Button>
                <Button onClick={() => void act("decline")} disabled={busy !== null} variant="secondary" className="w-auto px-6">
                  Décliner
                </Button>
              </>
            ) : null}
            {me?.status === "ready" && match.isHost ? (
              <>
                <Button onClick={() => void act("start")} disabled={!canStart || busy !== null} variant="brass" className="w-auto px-6" data-arena-start>
                  {busy === "start" ? "Lancement…" : canStart ? "Lancer la bataille" : "En attente d'un ami…"}
                </Button>
                <Button onClick={() => void act("cancel")} disabled={busy !== null} variant="secondary" className="w-auto px-6">
                  Annuler la partie
                </Button>
              </>
            ) : null}
            {me?.status === "ready" && !match.isHost ? (
              <Button onClick={() => void act("leave")} disabled={busy !== null} variant="secondary" className="w-auto px-6">
                Quitter
              </Button>
            ) : null}
          </div>
          {me?.status === "declined" || me?.status === "left" ? <CardText className="mt-3">Tu ne participes pas à cette partie.</CardText> : null}
          <CardText className="mt-3 text-xs">
            Chaque joueur pose le marqueur de sa créature sur la même table. Lance la caméra dès maintenant pour vérifier que les créatures sont reconnues ; la bataille démarre pour
            tout le monde quand l&apos;hôte la lance. Une partie compte dans la limite quotidienne, comme « Jouer » et « Défendre ».
          </CardText>
        </Card>
      ) : null}

      {inGame ? <ArenaGame transport={transport} initial={snapshot} preview={preview} onLeave={() => void act("leave")} /> : null}

      {match.status === "finished" ? (
        <Card data-arena-results>
          <div className="flex items-center gap-2">
            <Trophy className="h-6 w-6 text-brass-300" aria-hidden="true" />
            <CardTitle>Classement</CardTitle>
          </div>
          <ol className="mt-2 divide-y divide-ink-600/80">
            {ranked.map((p) => (
              <li key={p.userId} className={cn("flex min-h-11 items-center justify-between gap-3 py-2 text-sm", p.mine && "font-semibold text-cream-50")}>
                <span className="flex items-center gap-2">
                  <span className={cn("w-8 text-center font-display text-lg", p.rank === 1 ? "text-brass-300" : "text-cream-500")}>{rankLabel(p.rank)}</span>
                  <span>{p.mine ? "Toi" : p.username}</span>
                  <span className="text-cream-500">· {p.creatureName ?? "sa créature"}</span>
                </span>
                <span className="text-xs text-cream-500">
                  {p.status === "left" ? "parti · " : ""}
                  {p.hp} pv · {p.hitsDealt} touche{p.hitsDealt > 1 ? "s" : ""}
                  {p.goodEaten > 0 ? ` · ${p.goodEaten} bon${p.goodEaten > 1 ? "s" : ""} aliment${p.goodEaten > 1 ? "s" : ""}` : ""}
                </span>
              </li>
            ))}
          </ol>
          {reward && "score" in reward ? (
            <div className="mt-3 rounded-2xl bg-ink-900/70 p-3 text-center">
              <p className="font-display text-4xl font-semibold text-cream-50">{reward.score}</p>
              <p className="text-sm text-cream-300">{reward.perfect ? "Victoire parfaite !" : reward.score >= 70 ? "Belle bataille !" : "On se refait ça bientôt ?"}</p>
              <p className="mt-1 text-xs text-cream-500">
                +{reward.effects.moodDelta} humeur · +{reward.effects.xpDelta} XP
                {reward.effects.xpMultiplier > 1
                  ? ` (bonne humeur : XP ×${reward.effects.xpMultiplier.toLocaleString("fr-FR")})`
                  : reward.effects.xpMultiplier < 1
                    ? ` (humeur basse : XP ×${reward.effects.xpMultiplier.toLocaleString("fr-FR")})`
                    : ""}{" "}
                · {reward.playsLeft} partie{reward.playsLeft > 1 ? "s" : ""} restante{reward.playsLeft > 1 ? "s" : ""} aujourd&apos;hui
              </p>
            </div>
          ) : reward && "skipped" in reward ? (
            <CardText className="mt-3">{SKIPPED_LABEL[reward.skipped] ?? "Pas de récompense pour cette partie."}</CardText>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <LinkButton href="/arena" variant="brass" className="w-auto px-5">
              Nouvelle partie
            </LinkButton>
            <LinkButton href="/home" variant="secondary" className="w-auto px-5">
              Retour à l&apos;accueil
            </LinkButton>
          </div>
        </Card>
      ) : null}

      {match.status === "cancelled" ? (
        <Card>
          <CardTitle>Partie annulée</CardTitle>
          <CardText className="mt-1">L&apos;hôte a fermé la partie, ou personne ne l&apos;a lancée à temps.</CardText>
          <Link href="/arena" className="mt-3 inline-block text-sm font-semibold text-sage-300 underline">
            Retour à l&apos;arène
          </Link>
        </Card>
      ) : null}
    </div>
  );
}
