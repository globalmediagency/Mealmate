import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { PlayHub, type HubInvitation, type HubOpenMatch } from "@/components/game/play-hub";
import { isMarkerId } from "@/lib/ar/config";
import { photoMarkerUrls } from "@/lib/ar/photo-marker";
import { ensureCreatureMarker } from "@/lib/ar/service";
import { listMatchesFor } from "@/lib/arena/service";
import { requireViewer } from "@/lib/auth/session";
import { getHeldCreature } from "@/lib/boarding/service";
import { listFriends } from "@/lib/friends/service";
import { ARENA } from "@/lib/game/config";
import { getGameRules } from "@/lib/game/rules-service";
import { playsLeftLabel } from "@/lib/game/dialogue";
import { countPlaysToday } from "@/lib/play/service";

export const metadata: Metadata = { title: "Jouer" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<{ creature?: string }>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The games hub (spec § 3.5): every game, what it needs and the shared daily counter, for the user's creature or one boarded with them. */
export default async function PlayPage({ searchParams }: { searchParams: SearchParams }) {
  const { session } = await requireViewer();
  const { creature: creatureParam } = await searchParams;
  const creatureId = creatureParam && UUID.test(creatureParam) ? creatureParam : null;
  const now = new Date();
  const rules = await getGameRules();
  const held = await getHeldCreature(session.user.id, creatureId, now, rules).catch(() => null);
  const creature = held?.creature;
  if (!held || !creature || creature.status !== "alive" || !creature.name) redirect("/home");
  const boarded = held.boarding !== null;
  const [plays, friends, listing, markerId, photos] = await Promise.all([
    countPlaysToday(creature.id),
    boarded ? [] : listFriends(session.user.id, now).catch(() => []),
    boarded ? null : listMatchesFor(session.user.id, now, rules).catch(() => null),
    // The marker is created here for one's own creature (never for a boarded one: it belongs to its owner).
    boarded ? creature.arMarker : ensureCreatureMarker(creature).catch(() => null),
    photoMarkerUrls([creature.userId]).catch(() => new Map<string, string>()),
  ]);
  const invitations: HubInvitation[] = (listing?.invitations ?? []).map((s) => ({
    matchId: s.match.id,
    hostName: s.players.find((p) => p.isHost)?.username ?? "Un ami",
    mode: s.match.mode,
    players: s.players.filter((p) => !p.isHost && !p.mine && (p.status === "ready" || p.status === "invited")).map((p) => p.username),
  }));
  const openMatches: HubOpenMatch[] = (listing?.open ?? []).map((s) => ({ matchId: s.match.id, mode: s.match.mode, status: s.match.status === "playing" ? "playing" : "lobby" }));
  const playsLeft = Math.max(0, rules.play.maxPerDay - plays);
  const backHref = boarded ? `/pension/${creature.id}` : "/home";
  return (
    <div className="space-y-4 animate-rise">
      <PageHeader
        title={`Jouer avec ${creature.name}`}
        subtitle={boarded ? `En pension chez toi · ${playsLeftLabel(playsLeft).toLowerCase()}` : undefined}
        back={{ href: backHref, label: boarded ? "Retour à la pension" : "Retour à ma créature" }}
      />
      <PlayHub
        creatureName={creature.name}
        boarded={boarded ? { creatureId: creature.id, ownerName: held.owner?.username ?? "son propriétaire" } : null}
        playsLeft={playsLeft}
        maxPerDay={rules.play.maxPerDay}
        friendsAvailable={friends.filter((f) => f.creature.status === "alive" && f.creature.name !== null).length}
        invitations={invitations}
        openMatches={openMatches}
        marker={isMarkerId(markerId) ? { id: markerId, creatureId: boarded ? undefined : creature.id, ownerName: boarded ? (held.owner?.username ?? null) : null, photoUrl: photos.get(creature.userId) ?? null } : null}
        maxPlayers={ARENA.maxPlayers}
        pingpongPoints={rules.pingpong.pointsToWin}
      />
    </div>
  );
}
