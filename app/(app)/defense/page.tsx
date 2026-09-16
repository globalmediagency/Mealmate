import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ArTarget } from "@/components/ar/types";
import { MarkerCard } from "@/components/ar/marker-card";
import { DefenseGame } from "@/components/defense/defense-game";
import { Card, CardText, CardTitle } from "@/components/ui/card";
import { getOutfit, outfitToEquipped } from "@/lib/accessories/service";
import { isMarkerId } from "@/lib/ar/config";
import { ensureCreatureMarker } from "@/lib/ar/service";
import { requireViewer } from "@/lib/auth/session";
import { getHeldCreature } from "@/lib/boarding/service";
import { deriveState } from "@/lib/game/creature-view";
import { stageForXp } from "@/lib/game/growth";
import { getGameRules } from "@/lib/game/rules-service";
import { countPlaysToday } from "@/lib/play/service";

export const metadata: Metadata = { title: "Défendre" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<{ creature?: string }>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** "Défendre": the tower-defense game on the creature's marker (spec § 3.21), for the user's own creature or one boarded with them. */
export default async function DefensePage({ searchParams }: { searchParams: SearchParams }) {
  const { session } = await requireViewer();
  const { creature: creatureParam } = await searchParams;
  const creatureId = creatureParam && UUID.test(creatureParam) ? creatureParam : null;
  const now = new Date();
  const rules = await getGameRules();
  const held = await getHeldCreature(session.user.id, creatureId, now, rules).catch(() => null);
  const creature = held?.creature;
  if (!held || !creature || creature.status !== "alive" || !creature.name || !creature.speciesId) redirect("/home");
  const boarded = held.boarding !== null;
  const homeHref = boarded ? `/pension/${creature.id}` : "/home";
  const markerId = boarded ? creature.arMarker : await ensureCreatureMarker(creature);
  if (!isMarkerId(markerId)) {
    return (
      <Card className="animate-rise">
        <CardTitle>Pas encore de marqueur</CardTitle>
        <CardText className="mt-1">
          {creature.name} n&apos;a pas encore de marqueur imprimé : son propriétaire doit ouvrir « Voir en vrai » une fois pour le créer.
        </CardText>
        <Link href={homeHref} className="mt-3 inline-block text-sm font-semibold text-sage-300 underline">
          Retour
        </Link>
      </Card>
    );
  }
  const [plays, outfit] = await Promise.all([countPlaysToday(creature.id), getOutfit(creature.id)]);
  const target: ArTarget = {
    markerId,
    mine: !boarded,
    ownerName: boarded ? (held.owner?.username ?? null) : null,
    creature: { name: creature.name, speciesId: creature.speciesId, stage: stageForXp(creature.xp).id, state: deriveState(creature), accessories: outfitToEquipped(outfit) },
  };
  return (
    <div className="space-y-5 animate-rise">
      <DefenseGame
        target={target}
        rules={rules.defense}
        playsLeft={Math.max(0, rules.play.maxPerDay - plays)}
        maxPerDay={rules.play.maxPerDay}
        creatureId={boarded ? creature.id : undefined}
        homeHref={homeHref}
      />
      <MarkerCard name={creature.name} markerId={markerId} creatureId={boarded ? undefined : creature.id} ownerName={target.ownerName} />
    </div>
  );
}
