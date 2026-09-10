import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FoodCatchGame } from "@/components/game/food-catch-game";
import { getOutfit, outfitToEquipped } from "@/lib/accessories/service";
import { requireViewer } from "@/lib/auth/session";
import { loadActiveCreatureView } from "@/lib/creatures/loader";
import { PLAY } from "@/lib/game/config";
import { countPlaysToday } from "@/lib/play/service";

export const metadata: Metadata = { title: "Jouer" };

export default async function PlayPage() {
  const { session } = await requireViewer();
  const creature = await loadActiveCreatureView(session.user.id);
  if (!creature || creature.status !== "alive" || !creature.name) redirect("/home");
  const [plays, outfit] = await Promise.all([countPlaysToday(session.user.id), getOutfit(creature.id)]);
  return <FoodCatchGame creature={creature} accessories={outfitToEquipped(outfit)} playsLeft={Math.max(0, PLAY.maxPerDay - plays)} />;
}
