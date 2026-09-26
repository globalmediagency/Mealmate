import { ChevronRight, CircleDot, Crosshair, Gamepad2, ScanLine, Shield, Swords, User, Users } from "lucide-react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { MarkerCard } from "@/components/ar/marker-card";
import { Card, CardText, CardTitle } from "@/components/ui/card";
import type { ArenaMode } from "@/lib/arena/service";
import { ARENA_MODE_LABELS } from "@/lib/arena/labels";
import { PLAY } from "@/lib/game/config";
import { playLimitLabel, playsLeftLabel } from "@/lib/game/dialogue";
import { cn } from "@/lib/utils/cn";

export type HubInvitation = { matchId: string; hostName: string; mode: ArenaMode; players: string[] };
export type HubOpenMatch = { matchId: string; mode: ArenaMode; status: "lobby" | "playing" };
/** The two doors of the hub: games played alone, games played with friends around the table. */
export type GameKind = "solo" | "friends";

/** A creature boarded with the player: the solo games carry `?creature=`, the friends' games are not offered. */
export type HubBoarded = { creatureId: string; ownerName: string };

export type PlayHubProps = {
  creatureName: string;
  boarded?: HubBoarded | null;
  playsLeft: number;
  maxPerDay: number;
  /** Accepted friends, whatever their creature: without any, the friends' door is greyed and leads to the friends page. */
  friendsCount: number;
  invitations?: HubInvitation[];
  openMatches?: HubOpenMatch[];
  /** The creature's printed marker (null when it could not be created). */
  marker?: { id: number; creatureId?: string; ownerName?: string | null } | null;
};

export type GameListProps = {
  kind: GameKind;
  creatureName: string;
  boarded?: HubBoarded | null;
  playsLeft: number;
  maxPerDay: number;
  /** Friends whose creature is alive and named (the friends' games need at least one). */
  friendsAvailable?: number;
  /** How many players the friends' games take and the ping-pong target, from the rules. */
  maxPlayers: number;
  pingpongPoints: number;
};

type GameCard = {
  id: string;
  title: string;
  pitch: string;
  needs: string;
  icon: LucideIcon;
  href: string;
  ar: boolean;
};

/** Where the friends' door leads when the player has no friend yet: the friends page, with a word of explanation. */
export const FRIENDS_FOR_PLAY_HREF = "/friends?from=play";

export const GAME_KIND_LABELS: Record<GameKind, string> = { solo: "Jeux solo", friends: "Jeux entre amis" };

/** The shared daily counter, on top of the hub and of both lists. */
function PlaysCounter({ playsLeft, maxPerDay }: { playsLeft: number; maxPerDay: number }) {
  const exhausted = playsLeft <= 0;
  return (
    <p className={cn("rounded-2xl border px-4 py-2.5 text-sm", exhausted ? "border-ink-600/80 bg-ink-800/70 text-cream-300" : "border-sage-500/40 bg-sage-500/10 text-sage-100")} data-plays-counter>
      <strong>{playsLeftLabel(playsLeft)}</strong>
      <span className="block text-xs text-cream-500">{playLimitLabel(maxPerDay)}{exhausted ? " Le compteur repart à minuit." : ""}</span>
    </p>
  );
}

/**
 * The games hub behind "Jouer" (spec § 3.5): the shared daily counter, the
 * invitations and the match in progress first, then two big doors (solo,
 * with friends) that open the lists of games, the marker and "Voir en vrai"
 * below. The friends' door is greyed without any friend and sends the player
 * to the friends page instead.
 */
export function PlayHub({ creatureName, boarded = null, playsLeft, maxPerDay, friendsCount, invitations = [], openMatches = [], marker = null }: PlayHubProps) {
  const creatureQuery = boarded ? `?creature=${boarded.creatureId}` : "";
  const noFriends = friendsCount === 0;

  return (
    <div className="space-y-4" data-play-hub data-plays-left={playsLeft}>
      <PlaysCounter playsLeft={playsLeft} maxPerDay={maxPerDay} />

      {invitations.length > 0 ? (
        <Card className="border-brass-500/40" data-hub-invitations>
          <CardTitle className="text-lg">Invitations</CardTitle>
          <ul className="mt-2 divide-y divide-ink-600/80">
            {invitations.map((invite) => (
              <li key={invite.matchId}>
                <Link href={`/arena/${invite.matchId}`} className="flex min-h-11 items-center gap-3 py-2 text-sm text-cream-100">
                  <span className="min-w-0 flex-1">
                    <strong>{invite.hostName}</strong> t&apos;invite · {ARENA_MODE_LABELS[invite.mode]}
                    {invite.players.length > 0 ? <span className="text-cream-500"> · avec {invite.players.join(", ")}</span> : null}
                  </span>
                  <span className="shrink-0 rounded-full bg-brass-400 px-3 py-1.5 text-xs font-semibold text-ink-950">Voir la partie</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {openMatches.length > 0 ? (
        <Card data-hub-open>
          <CardTitle className="text-lg">Partie en cours</CardTitle>
          <ul className="mt-2 divide-y divide-ink-600/80">
            {openMatches.map((match) => (
              <li key={match.matchId}>
                <Link href={`/arena/${match.matchId}`} className="flex min-h-11 items-center gap-3 py-2 text-sm text-cream-100">
                  <span className="min-w-0 flex-1">
                    {ARENA_MODE_LABELS[match.mode]} · {match.status === "playing" ? "en cours" : "salle d'attente"}
                  </span>
                  <span className="shrink-0 rounded-full bg-sage-500 px-3 py-1.5 text-xs font-semibold text-ink-950">Reprendre</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <div className={cn("grid gap-3", boarded ? "grid-cols-1" : "grid-cols-2")} role="group" aria-label="Choisis un type de jeu">
        <Link
          href={`/play/solo${creatureQuery}`}
          data-hub-door="solo"
          className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-3xl border border-ink-600/80 bg-ink-800/90 p-4 text-center shadow-card transition-colors hover:border-sage-500/50"
        >
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-sage-800/40 text-sage-300">
            <User className="h-7 w-7" aria-hidden="true" />
          </span>
          <span className="font-display text-xl font-semibold text-cream-50">Solo</span>
          <span className="text-xs leading-snug text-cream-500">Attrape-repas, Défendre</span>
        </Link>
        {!boarded ? (
          <Link
            href={noFriends ? FRIENDS_FOR_PLAY_HREF : "/play/amis"}
            data-hub-door="friends"
            data-disabled={noFriends ? "true" : undefined}
            aria-describedby={noFriends ? "hub-door-friends-help" : undefined}
            className={cn(
              "flex min-h-40 flex-col items-center justify-center gap-2 rounded-3xl border p-4 text-center transition-colors",
              noFriends ? "border-dashed border-ink-600/80 bg-ink-800/50 opacity-60 hover:opacity-80" : "border-ink-600/80 bg-ink-800/90 shadow-card hover:border-sage-500/50",
            )}
          >
            <span className={cn("flex h-14 w-14 items-center justify-center rounded-2xl", noFriends ? "bg-ink-700 text-cream-500" : "bg-sage-800/40 text-sage-300")}>
              <Users className="h-7 w-7" aria-hidden="true" />
            </span>
            <span className={cn("font-display text-xl font-semibold", noFriends ? "text-cream-300" : "text-cream-50")}>Entre amis</span>
            <span id="hub-door-friends-help" className="text-xs leading-snug text-cream-500">
              {noFriends ? "Ajoute d'abord un ami" : "Défendre ensemble, Arène, Ping-pong"}
            </span>
          </Link>
        ) : null}
      </div>

      {marker ? (
        <MarkerCard compact name={creatureName} markerId={marker.id} creatureId={marker.creatureId} ownerName={marker.ownerName} />
      ) : (
        <p className="text-xs text-cream-500">
          {boarded
            ? `${creatureName} n'a pas encore de marqueur : ${boarded.ownerName} le crée en ouvrant « Voir en vrai » dans son application.`
            : `Le marqueur de ${creatureName} sera créé à ta première visite de « Défendre » ou de « Voir en vrai ».`}
        </p>
      )}

      <Link href="/ar" className="flex min-h-14 items-center gap-3 rounded-3xl border border-ink-600/80 bg-ink-800/70 px-4 py-3 text-sm text-cream-100 hover:border-sage-500/50" data-hub-ar>
        <ScanLine className="h-5 w-5 shrink-0 text-sage-300" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <strong>Voir {creatureName} en vrai</strong>
          <span className="block text-xs text-cream-500">Ta créature sur sa feuille, dans ta caméra. Pas un jeu : ça ne compte pas dans les parties.</span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-cream-700" aria-hidden="true" />
      </Link>

      <details className="rounded-3xl border border-ink-600/80 bg-ink-800/70 px-4 py-2">
        <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-cream-100">C&apos;est quoi, la réalité augmentée (RA) ?</summary>
        <CardText className="pb-2">
          Tu imprimes le marqueur (un carré noir), tu le poses sur une table et tu le cadres avec ta caméra : ta créature apparaît dessus, à l&apos;écran, comme si elle était là.
          Les images de la caméra restent sur ton téléphone.
        </CardText>
      </details>
    </div>
  );
}

/**
 * One door of the hub (`/play/solo`, `/play/amis`): the games of that kind
 * as cards that say what they need, under the shared daily counter. The
 * cards stay openable at zero play (the game explains).
 */
export function GameList({ kind, creatureName, boarded = null, playsLeft, maxPerDay, friendsAvailable = 0, maxPlayers, pingpongPoints }: GameListProps) {
  const creatureQuery = boarded ? `?creature=${boarded.creatureId}` : "";
  const friends = maxPlayers - 1;
  const cards: GameCard[] =
    kind === "solo"
      ? [
          {
            id: "catch",
            title: "Attrape-repas",
            pitch: `Glisse ${creatureName} sous les bons aliments et évite la malbouffe pendant ${PLAY.durationSeconds} secondes.`,
            needs: "Rien : ni caméra, ni marqueur.",
            icon: Gamepad2,
            href: `/play/catch${creatureQuery}`,
            ar: false,
          },
          {
            id: "defense",
            title: "Défendre",
            pitch: `La malbouffe fonce sur ${creatureName} : lance des œufs, tire la langue sur les fruits pour regagner de la vie.`,
            needs: `La caméra et le marqueur imprimé de ${creatureName}.`,
            icon: Crosshair,
            href: `/defense${creatureQuery}`,
            ar: true,
          },
        ]
      : [
          {
            id: "coop",
            title: ARENA_MODE_LABELS.coop,
            pitch: "Protégez vos créatures côte à côte contre la malbouffe qui attaque toute la table.",
            needs: `1 à ${friends} ami${friends > 1 ? "s" : ""} avec une créature vivante, la caméra et vos marqueurs sur la même table.`,
            icon: Shield,
            href: "/arena?mode=coop",
            ar: true,
          },
          {
            id: "arena",
            title: ARENA_MODE_LABELS.arena,
            pitch: "Bataille d'œufs entre amis : chacun pose son marqueur et vise les créatures des autres.",
            needs: `1 à ${friends} ami${friends > 1 ? "s" : ""} avec une créature vivante, la caméra et vos marqueurs.`,
            icon: Swords,
            href: "/arena?mode=arena",
            ar: true,
          },
          {
            id: "pingpong",
            title: ARENA_MODE_LABELS.pingpong,
            pitch: `Un duel : frappe quand l'anneau devient vert, lob ou smash pour surprendre. ${pingpongPoints} points pour gagner.`,
            needs: "1 ami avec une créature vivante, la caméra et vos deux marqueurs.",
            icon: CircleDot,
            href: "/arena?mode=pingpong",
            ar: true,
          },
        ];
  const exhausted = playsLeft <= 0;

  return (
    <div className="space-y-4" data-game-list={kind} data-plays-left={playsLeft}>
      <PlaysCounter playsLeft={playsLeft} maxPerDay={maxPerDay} />

      {kind === "friends" && friendsAvailable === 0 ? (
        <p className="rounded-2xl border border-brass-500/40 bg-brass-500/10 px-4 py-2.5 text-sm text-cream-100" data-hub-no-friends>
          Aucun de tes amis n&apos;a de créature vivante pour l&apos;instant : tu pourras les inviter dès qu&apos;une éclot.{" "}
          <Link href="/friends" className="font-semibold text-sage-300 underline">
            Voir mes amis
          </Link>
        </p>
      ) : null}

      <ul className="space-y-2" aria-label={GAME_KIND_LABELS[kind]}>
        {cards.map(({ id, title, pitch, needs, icon: Icon, href, ar }) => (
          <li key={id}>
            <Link
              href={href}
              data-game-card={id}
              className={cn(
                "flex min-h-20 items-start gap-3 rounded-3xl border border-ink-600/80 bg-ink-800/90 p-4 shadow-card transition-colors hover:border-sage-500/50",
                exhausted && "opacity-60",
              )}
            >
              <span className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-sage-800/40 text-sage-300">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-display text-lg font-semibold text-cream-50">{title}</span>
                  {ar ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-sage-500/50 bg-sage-500/10 px-2 py-0.5 text-xs text-sage-200" title="En réalité augmentée">
                      <ScanLine className="h-3 w-3" aria-hidden="true" /> RA
                    </span>
                  ) : null}
                  {exhausted ? <span className="rounded-full bg-ink-700 px-2 py-0.5 text-xs text-cream-500">À demain !</span> : null}
                </span>
                <span className="mt-1 block text-sm leading-snug text-cream-300">{pitch}</span>
                <span className="mt-1 block text-xs text-cream-500">Il te faut : {needs}</span>
              </span>
              <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-cream-700" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>

      {kind === "friends" ? (
        <details className="rounded-3xl border border-ink-600/80 bg-ink-800/70 px-4 py-2">
          <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-cream-100">Comment on joue à plusieurs ?</summary>
          <CardText className="pb-2">
            Chacun imprime le marqueur de sa créature, vous posez les feuilles sur la même table et chacun cadre la table avec son téléphone. L&apos;hôte invite ses amis
            depuis le jeu choisi ; les invités reçoivent l&apos;invitation ici et sur leur écran Créature.
          </CardText>
        </details>
      ) : null}
    </div>
  );
}
