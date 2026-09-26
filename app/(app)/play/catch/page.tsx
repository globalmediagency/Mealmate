import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FoodCatchGame } from "@/components/game/food-catch-game";
import { getOutfit, outfitToEquipped } from "@/lib/accessories/service";
import { requireViewer } from "@/lib/auth/session";
import { getHeldCreature } from "@/lib/boarding/service";
import { toCreatureView } from "@/lib/game/creature-view";
import { getGameRules } from "@/lib/game/rules-service";
import { countPlaysToday } from "@/lib/play/service";

export const metadata: Metadata = { title: "Attrape-repas" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<{ creature?: string }>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** "Attrape-repas": the food-catch mini-game, with the user's own creature or one boarded with them (`?creature=<id>`). */
export default async function CatchPage({ searchParams }: { searchParams: SearchParams }) {
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
      playsLeft={Math.max(0, rules.play.maxPerDay - plays)}
      maxPerDay={rules.play.maxPerDay}
      creatureId={boarded ? creature.id : undefined}
      homeHref={boarded ? `/play?creature=${creature.id}` : "/play"}
    />
  );
}
