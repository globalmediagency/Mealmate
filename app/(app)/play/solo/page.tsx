import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { GameList } from "@/components/game/play-hub";
import { requireViewer } from "@/lib/auth/session";
import { ARENA } from "@/lib/game/config";
import { getGameRules } from "@/lib/game/rules-service";
import { loadPlayCreature } from "@/lib/play/hub";
import { countPlaysToday } from "@/lib/play/service";

export const metadata: Metadata = { title: "Jeux solo" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<{ creature?: string }>;

/** The solo door of the hub: Attrape-repas and Défendre, for the user's creature or one boarded with them. */
export default async function PlaySoloPage({ searchParams }: { searchParams: SearchParams }) {
  const { session } = await requireViewer();
  const { creature: creatureParam } = await searchParams;
  const now = new Date();
  const rules = await getGameRules();
  const play = await loadPlayCreature(session.user.id, creatureParam, now, rules);
  if (!play) redirect("/home");
  const { creature, held, boarded } = play;
  const plays = await countPlaysToday(creature.id);
  return (
    <div className="space-y-4 animate-rise">
      <PageHeader title="Jeux solo" subtitle={`${creature.name} joue seul${boarded ? "e chez toi" : ""}, à ton rythme.`} back={{ href: `/play${play.creatureQuery}`, label: "Retour aux jeux" }} />
      <GameList
        kind="solo"
        creatureName={creature.name}
        boarded={boarded ? { creatureId: creature.id, ownerName: held.owner?.username ?? "son propriétaire" } : null}
        playsLeft={Math.max(0, rules.play.maxPerDay - plays)}
        maxPerDay={rules.play.maxPerDay}
        maxPlayers={ARENA.maxPlayers}
        pingpongPoints={rules.pingpong.pointsToWin}
      />
    </div>
  );
}
