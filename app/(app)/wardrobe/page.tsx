import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Wardrobe } from "@/components/game/wardrobe";
import { PageHeader } from "@/components/layout/page-header";
import { getOutfit, getOwnedAccessories } from "@/lib/accessories/service";
import { requireViewer } from "@/lib/auth/session";
import { loadActiveCreatureView } from "@/lib/creatures/loader";

export const metadata: Metadata = { title: "Garde-robe" };

export default async function WardrobePage() {
  const { session } = await requireViewer();
  const creature = await loadActiveCreatureView(session.user.id);
  if (!creature || creature.status !== "alive" || !creature.name) redirect("/home");
  const [owned, outfit] = await Promise.all([getOwnedAccessories(session.user.id), getOutfit(creature.id)]);
  return (
    <div className="space-y-4">
      <PageHeader title="Garde-robe" subtitle={`${owned.length} accessoire${owned.length > 1 ? "s" : ""} gagné${owned.length > 1 ? "s" : ""} en marchant.`} />
      <Wardrobe creature={creature} owned={owned.map((o) => o.accessory)} outfit={outfit} counts={Object.fromEntries(owned.map((o) => [o.accessory.id, o.qty]))} />
    </div>
  );
}
