import type { Metadata } from "next";
import { CollectionGrid } from "@/components/game/collection-grid";
import { PageHeader } from "@/components/layout/page-header";
import { requireViewer } from "@/lib/auth/session";
import { ALL_SPECIES } from "@/lib/creatures";
import { getObtainedSpeciesIds } from "@/lib/creatures/service";
import { discoverableSpecies, getDisabledSpecies } from "@/lib/game/species-service";

export const metadata: Metadata = { title: "Collection" };

export default async function CollectionPage() {
  const { session } = await requireViewer();
  const [obtainedIds, disabled] = await Promise.all([getObtainedSpeciesIds(session.user.id), getDisabledSpecies()]);
  const obtained = new Set(obtainedIds);
  // A species switched off from the admin stays in the collection of those who own it and disappears for the others.
  const visible = discoverableSpecies(ALL_SPECIES, disabled, obtained);
  return (
    <div className="space-y-6 animate-rise">
      <PageHeader title="Collection" subtitle={`${obtained.size} / ${visible.length} créatures découvertes.`} back={{ href: "/more", label: "Retour" }} />
      <CollectionGrid obtained={obtained} hidden={new Set(ALL_SPECIES.filter((s) => !visible.includes(s)).map((s) => s.id))} />
    </div>
  );
}
