import type { Metadata } from "next";
import { Footprints } from "lucide-react";
import { ComingSoon } from "@/components/layout/coming-soon";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = { title: "Activité" };

export default function ActivityPage() {
  return (
    <div className="space-y-5">
      <PageHeader title="Activité" subtitle="Tes pas, jour après jour." />
      <ComingSoon
        icon={Footprints}
        title="Tes pas comptent"
        description="Saisis tes pas du jour ou connecte Strava : ils feront éclore ton œuf puis renforceront ta créature."
      />
    </div>
  );
}
