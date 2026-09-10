import type { Metadata } from "next";
import { CollectionGrid } from "@/components/game/collection-grid";
import { PageHeader } from "@/components/layout/page-header";
import { requireViewer } from "@/lib/auth/session";
import { ALL_SPECIES } from "@/lib/creatures";
import { getObtainedSpeciesIds } from "@/lib/creatures/service";

export const metadata: Metadata = { title: "Collection" };

export default async function CollectionPage() {
  const { session } = await requireViewer();
  const obtained = new Set(await getObtainedSpeciesIds(session.user.id));
  return (
    <div className="space-y-6 animate-rise">
      <PageHeader title="Collection" subtitle={`${obtained.size} / ${ALL_SPECIES.length} créatures découvertes.`} />
      <CollectionGrid obtained={obtained} />
    </div>
  );
}
