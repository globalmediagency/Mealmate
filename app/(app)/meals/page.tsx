import type { Metadata } from "next";
import { UtensilsCrossed } from "lucide-react";
import { ComingSoon } from "@/components/layout/coming-soon";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = { title: "Repas" };

export default function MealsPage() {
  return (
    <div className="space-y-5">
      <PageHeader title="Repas" subtitle="Historique, scores et tendances." />
      <ComingSoon
        icon={UtensilsCrossed}
        title="Tes repas apparaîtront ici"
        description="Chaque photo de repas analysée sera conservée avec son score, ses macros et l'effet sur ta créature."
      />
    </div>
  );
}
