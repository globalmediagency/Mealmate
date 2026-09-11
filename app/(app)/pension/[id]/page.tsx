import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PensionHome } from "@/components/game/pension-home";
import { getChestStatus, getOutfit, outfitToEquipped } from "@/lib/accessories/service";
import { requireViewer } from "@/lib/auth/session";
import { getHeldCreature, toBoardingView } from "@/lib/boarding/service";
import { toCreatureView } from "@/lib/game/creature-view";
import { getGameRules } from "@/lib/game/rules-service";
import { getInventory } from "@/lib/shop/service";

export const metadata: Metadata = { title: "Pension" };

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A creature a friend entrusted to the user: play, heal, open its chests, send it home. */
export default async function PensionPage({ params }: { params: Promise<{ id: string }> }) {
  const { session } = await requireViewer();
  const { id } = await params;
  if (!UUID.test(id)) redirect("/home");
  const now = new Date();
  const rules = await getGameRules();
  const held = await getHeldCreature(session.user.id, id, now, rules).catch(() => null);
  if (!held || !held.boarding || !held.owner || held.creature.status !== "alive") redirect("/home");
  const [outfit, chest, inventory] = await Promise.all([getOutfit(held.creature.id), getChestStatus(held.creature), getInventory(session.user.id)]);
  return (
    <PensionHome
      creature={toCreatureView(held.creature, now, rules)}
      accessories={outfitToEquipped(outfit)}
      boarding={toBoardingView(held.boarding, now)}
      owner={held.owner}
      inventory={inventory}
      chest={chest}
    />
  );
}
