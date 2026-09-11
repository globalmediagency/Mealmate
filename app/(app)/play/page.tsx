import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FoodCatchGame } from "@/components/game/food-catch-game";
import { getOutfit, outfitToEquipped } from "@/lib/accessories/service";
import { requireViewer } from "@/lib/auth/session";
import { getHeldCreature } from "@/lib/boarding/service";
import { PLAY } from "@/lib/game/config";
import { toCreatureView } from "@/lib/game/creature-view";
import { getGameRules } from "@/lib/game/rules-service";
import { countPlaysToday } from "@/lib/play/service";

export const metadata: Metadata = { title: "Jouer" };

type SearchParams = Promise<{ creature?: string }>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Plays with the user's own creature, or with one boarded with them (`?creature=<id>`). */
export default async function PlayPage({ searchParams }: { searchParams: SearchParams }) {
  const { session } = await requireViewer();
  const { creature: creatureParam } = await searchParams;
  const creatureId = creatureParam && UUID.test(creatureParam) ? creatureParam : null;
  const now = new Date();
  const rules = await getGameRules();
  const held = await getHeldCreature(session.user.id, creatureId, now, rules).catch(() => null);
  if (!held || held.creature.status !== "alive" || !held.creature.name) redirect("/home");
  const creature = toCreatureView(held.creature, now, rules);
  const [plays, outfit] = await Promise.all([countPlaysToday(creature.id), getOutfit(creature.id)]);
  const boarded = held.boarding !== null;
  return (
    <FoodCatchGame
      creature={creature}
      accessories={outfitToEquipped(outfit)}
      playsLeft={Math.max(0, PLAY.maxPerDay - plays)}
      creatureId={boarded ? creature.id : undefined}
      homeHref={boarded ? `/pension/${creature.id}` : "/home"}
    />
  );
}
