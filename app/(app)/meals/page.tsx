import type { Metadata } from "next";
import { Camera } from "lucide-react";
import { MealsHistory } from "@/components/game/meals-history";
import { PageHeader } from "@/components/layout/page-header";
import { ConfigBanner } from "@/components/system/config-banner";
import { LinkButton } from "@/components/ui/button";
import { requireViewer } from "@/lib/auth/session";
import { loadActiveCreatureView } from "@/lib/creatures/loader";
import { ConfigError, getConfigStatus } from "@/lib/env";
import { getGameRules } from "@/lib/game/rules-service";
import { listMeals, mealStats, purgeExpiredMeals } from "@/lib/meals/service";
import { r2Storage } from "@/lib/storage/r2";

export const metadata: Metadata = { title: "Repas" };

export default async function MealsPage() {
  const { session } = await requireViewer();
  const status = getConfigStatus();
  const creature = await loadActiveCreatureView(session.user.id);
  const canFeed = creature?.status === "alive" && Boolean(creature.name);

  if (!status.r2) {
    return (
      <div className="space-y-5">
        <PageHeader title="Repas" subtitle="Historique, scores et tendances." />
        <ConfigBanner error={new ConfigError(["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"])} />
      </div>
    );
  }

  // Meals older than the retention rule go away (photo and row) before the history is read.
  await purgeExpiredMeals(session.user.id, r2Storage, new Date(), (await getGameRules()).feeding.mealRetentionDays);
  const [meals, stats] = await Promise.all([listMeals(session.user.id, r2Storage), mealStats(session.user.id)]);

  return (
    <div className="space-y-5 animate-rise">
      <PageHeader
        title="Repas"
        subtitle="Historique, scores et tendances."
        action={
          canFeed ? (
            <LinkButton href="/feed" size="md" className="w-auto">
              <Camera className="h-4 w-4" aria-hidden="true" />
              Nourrir
            </LinkButton>
          ) : null
        }
      />
      <MealsHistory meals={meals} stats={stats} tier={creature?.tier ?? null} />
    </div>
  );
}
