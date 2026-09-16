import type { Metadata } from "next";
import { ArenaList, type FriendOption } from "@/components/arena/arena-list";
import { MarkerCard } from "@/components/ar/marker-card";
import { PageHeader } from "@/components/layout/page-header";
import { ensureCreatureMarker } from "@/lib/ar/service";
import { listMatchesFor } from "@/lib/arena/service";
import { requireViewer } from "@/lib/auth/session";
import { getHeldCreatures } from "@/lib/boarding/service";
import { listFriends } from "@/lib/friends/service";
import { ARENA } from "@/lib/game/config";
import { getGameRules } from "@/lib/game/rules-service";
import { countPlaysToday } from "@/lib/play/service";

export const metadata: Metadata = { title: "Arène" };
export const dynamic = "force-dynamic";

/** "Arène" (spec § 3.22): open a battle with friends, answer invitations, review the latest ones. */
export default async function ArenaPage() {
  const { session } = await requireViewer();
  const now = new Date();
  const rules = await getGameRules();
  const [listing, friends, held] = await Promise.all([listMatchesFor(session.user.id, now, rules), listFriends(session.user.id, now), getHeldCreatures(session.user.id, now, rules)]);
  const own = held.own;
  let blocked: string | null = null;
  let marker: { name: string; id: number; creatureId: string } | null = null;
  if (!own || own.status !== "alive") blocked = "Il te faut une créature vivante pour entrer dans l'arène.";
  else if (!own.name) blocked = "Donne d'abord un nom à ta créature.";
  else if (held.away) blocked = `${own.name} est en pension chez ${held.away.host.username} : la bataille attendra son retour.`;
  else {
    marker = { name: own.name, id: await ensureCreatureMarker(own), creatureId: own.id };
    const plays = await countPlaysToday(own.id);
    if (plays >= rules.play.maxPerDay) blocked = `${own.name} a déjà joué ${rules.play.maxPerDay} fois aujourd'hui (limite partagée avec « Jouer » et « Défendre »). À demain !`;
  }
  const options: FriendOption[] = friends.map((f) => ({
    userId: f.user.userId,
    username: f.user.username,
    creatureName: f.creature.status === "alive" ? f.creature.name : null,
    available: f.creature.status === "alive" && f.creature.name !== null,
  }));
  return (
    <div className="space-y-5 animate-rise">
      <PageHeader title="Arène" subtitle="Une bataille d'œufs entre amis, en réalité augmentée." />
      <ArenaList listing={listing} friends={options} blocked={blocked} maxPlayers={ARENA.maxPlayers} />
      {marker ? <MarkerCard name={marker.name} markerId={marker.id} creatureId={marker.creatureId} /> : null}
      <p className="text-center text-xs text-cream-700">
        {rules.arena.durationSeconds} secondes, {rules.arena.hp} points de vie, {rules.arena.eggDamage} de dégâts par œuf. Les points de vie perdus ici ne touchent pas la vraie
        créature.
      </p>
    </div>
  );
}
