import type { Metadata } from "next";
import { Users } from "lucide-react";
import { ComingSoon } from "@/components/layout/coming-soon";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = { title: "Amis" };

export default function FriendsPage() {
  return (
    <div className="space-y-5">
      <PageHeader title="Amis" subtitle="Découvre les créatures de tes proches." />
      <ComingSoon
        icon={Users}
        title="Bientôt entre amis"
        description="Ton code ami est déjà prêt dans l'onglet Plus. L'ajout d'amis et l'affichage de leurs créatures arrivent prochainement."
      />
    </div>
  );
}
