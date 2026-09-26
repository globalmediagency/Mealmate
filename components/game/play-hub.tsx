import { ChevronRight, CircleDot, Crosshair, Gamepad2, ScanLine, Shield, Swords, Users } from "lucide-react";
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

export type PlayHubProps = {
  creatureName: string;
  /** A creature boarded with the player: the solo games carry `?creature=`, the friends' games are hidden. */
  boarded?: { creatureId: string; ownerName: string } | null;
  playsLeft: number;
  maxPerDay: number;
  /** Friends whose creature is alive and named (the friends' games need at least one). */
  friendsAvailable: number;
  invitations?: HubInvitation[];
  openMatches?: HubOpenMatch[];
  /** The creature's printed marker (null when it could not be created). */
  marker?: { id: number; creatureId?: string; ownerName?: string | null } | null;
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
  /** "solo" games work alone; "friends" games need friends around the table. */
  kind: "solo" | "friends";
  ar: boolean;
};

/**
 * The games hub behind "Jouer" (spec § 3.5): every game as a card that says
 * what it needs, the shared daily counter on top, the invitations first, the
 * marker and "Voir en vrai" below. One page instead of four doors.
 */
export function PlayHub({ creatureName, boarded = null, playsLeft, maxPerDay, friendsAvailable, invitations = [], openMatches = [], marker = null, maxPlayers, pingpongPoints }: PlayHubProps) {
  const creatureQuery = boarded ? `?creature=${boarded.creatureId}` : "";
  const friends = maxPlayers - 1;
  const allCards: GameCard[] = [
    {
      id: "catch",
      title: "Attrape-repas",
      pitch: `Glisse ${creatureName} sous les bons aliments et évite la malbouffe pendant ${PLAY.durationSeconds} secondes.`,
      needs: "Rien : ni caméra, ni marqueur.",
      icon: Gamepad2,
      href: `/play/catch${creatureQuery}`,
      kind: "solo",
      ar: false,
    },
    {
      id: "defense",
      title: "Défendre",
      pitch: `La malbouffe fonce sur ${creatureName} : lance des œufs, tire la langue sur les fruits pour regagner de la vie.`,
      needs: `La caméra et le marqueur imprimé de ${creatureName} (ou un marqueur photo).`,
      icon: Crosshair,
      href: `/defense${creatureQuery}`,
      kind: "solo",
      ar: true,
    },
    {
      id: "coop",
      title: ARENA_MODE_LABELS.coop,
      pitch: "Protégez vos créatures côte à côte contre la malbouffe qui attaque toute la table.",
      needs: `1 à ${friends} ami${friends > 1 ? "s" : ""} avec une créature vivante, la caméra et vos marqueurs sur la même table.`,
      icon: Shield,
      href: "/arena?mode=coop",
      kind: "friends",
      ar: true,
    },
    {
      id: "arena",
      title: ARENA_MODE_LABELS.arena,
      pitch: "Bataille d'œufs entre amis : chacun pose son marqueur et vise les créatures des autres.",
      needs: `1 à ${friends} ami${friends > 1 ? "s" : ""} avec une créature vivante, la caméra et vos marqueurs.`,
      icon: Swords,
      href: "/arena?mode=arena",
      kind: "friends",
      ar: true,
    },
    {
      id: "pingpong",
      title: ARENA_MODE_LABELS.pingpong,
      pitch: `Un duel : frappe quand l'anneau devient vert, lob ou smash pour surprendre. ${pingpongPoints} points pour gagner.`,
      needs: "1 ami avec une créature vivante, la caméra et vos deux marqueurs.",
      icon: CircleDot,
      href: "/arena?mode=pingpong",
      kind: "friends",
      ar: true,
    },
  ];
  const cards = allCards.filter((card) => !boarded || card.kind === "solo");
  const exhausted = playsLeft <= 0;

  return (
    <div className="space-y-4" data-play-hub data-plays-left={playsLeft}>
      <p className={cn("rounded-2xl border px-4 py-2.5 text-sm", exhausted ? "border-ink-600/80 bg-ink-800/70 text-cream-300" : "border-sage-500/40 bg-sage-500/10 text-sage-100")} data-plays-counter>
        <strong>{playsLeftLabel(playsLeft)}</strong>
        <span className="block text-xs text-cream-500">{playLimitLabel(maxPerDay)}{exhausted ? " Le compteur repart à minuit." : ""}</span>
      </p>

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

      <ul className="space-y-2" aria-label="Les jeux">
        {cards.map(({ id, title, pitch, needs, icon: Icon, href, kind, ar }) => (
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
                  <span className="inline-flex items-center gap-1 rounded-full border border-ink-500 bg-ink-700 px-2 py-0.5 text-xs text-cream-300">
                    {kind === "solo" ? "Solo" : <><Users className="h-3 w-3" aria-hidden="true" /> Entre amis</>}
                  </span>
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

      {!boarded && friendsAvailable === 0 ? (
        <p className="text-xs text-cream-500" data-hub-no-friends>
          Les jeux entre amis attendent un ami dont la créature est vivante.{" "}
          <Link href="/friends" className="font-semibold text-sage-300 underline">
            Ajouter des amis
          </Link>
        </p>
      ) : null}

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
