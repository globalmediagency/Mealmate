import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { PlayHub, type HubInvitation, type HubOpenMatch } from "@/components/game/play-hub";
import { isMarkerId } from "@/lib/ar/config";
import { ensureCreatureMarker } from "@/lib/ar/service";
import { listMatchesFor } from "@/lib/arena/service";
import { requireViewer } from "@/lib/auth/session";
import { acceptedFriendIds } from "@/lib/friends/service";
import { getGameRules } from "@/lib/game/rules-service";
import { playsLeftLabel } from "@/lib/game/dialogue";
import { loadPlayCreature } from "@/lib/play/hub";
import { countPlaysToday } from "@/lib/play/service";

export const metadata: Metadata = { title: "Jouer" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<{ creature?: string }>;

/** The games hub (spec § 3.5): the shared daily counter, the invitations and two doors (solo, with friends), for the user's creature or one boarded with them. */
export default async function PlayPage({ searchParams }: { searchParams: SearchParams }) {
  const { session } = await requireViewer();
  const { creature: creatureParam } = await searchParams;
  const now = new Date();
  const rules = await getGameRules();
  const play = await loadPlayCreature(session.user.id, creatureParam, now, rules);
  if (!play) redirect("/home");
  const { creature, held, boarded } = play;
  const [plays, friendIds, listing, markerId] = await Promise.all([
    countPlaysToday(creature.id),
    boarded ? [] : acceptedFriendIds(session.user.id).catch(() => []),
    boarded ? null : listMatchesFor(session.user.id, now, rules).catch(() => null),
    // The marker is created here for one's own creature (never for a boarded one: it belongs to its owner).
    boarded ? creature.arMarker : ensureCreatureMarker(creature).catch(() => null),
  ]);
  const invitations: HubInvitation[] = (listing?.invitations ?? []).map((s) => ({
    matchId: s.match.id,
    hostName: s.players.find((p) => p.isHost)?.username ?? "Un ami",
    mode: s.match.mode,
    players: s.players.filter((p) => !p.isHost && !p.mine && (p.status === "ready" || p.status === "invited")).map((p) => p.username),
  }));
  const openMatches: HubOpenMatch[] = (listing?.open ?? []).map((s) => ({ matchId: s.match.id, mode: s.match.mode, status: s.match.status === "playing" ? "playing" : "lobby" }));
  const playsLeft = Math.max(0, rules.play.maxPerDay - plays);
  return (
    <div className="space-y-4 animate-rise">
      <PageHeader
        title={`Jouer avec ${creature.name}`}
        subtitle={boarded ? `En pension chez toi · ${playsLeftLabel(playsLeft).toLowerCase()}` : undefined}
        back={{ href: play.backHref, label: boarded ? "Retour à la pension" : "Retour à ma créature" }}
      />
      <PlayHub
        creatureName={creature.name}
        boarded={boarded ? { creatureId: creature.id, ownerName: held.owner?.username ?? "son propriétaire" } : null}
        playsLeft={playsLeft}
        maxPerDay={rules.play.maxPerDay}
        friendsCount={friendIds.length}
        invitations={invitations}
        openMatches={openMatches}
        marker={isMarkerId(markerId) ? { id: markerId, creatureId: boarded ? undefined : creature.id, ownerName: boarded ? (held.owner?.username ?? null) : null } : null}
      />
    </div>
  );
}
