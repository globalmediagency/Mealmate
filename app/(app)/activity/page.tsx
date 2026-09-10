import type { Metadata } from "next";
import { Egg, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { StepsForm } from "@/components/game/steps-form";
import { StepsHistory } from "@/components/game/steps-history";
import { ChestOpener } from "@/components/game/chest-reveal";
import { StravaCard } from "@/components/game/strava-card";
import { getChestStatus } from "@/lib/accessories/service";
import { getActiveCreature } from "@/lib/creatures/service";
import { Card, CardText, CardTitle } from "@/components/ui/card";
import { requireViewer } from "@/lib/auth/session";
import { loadActiveCreatureView } from "@/lib/creatures/loader";
import { getConfigStatus } from "@/lib/env";
import { STEPS } from "@/lib/game/config";
import { gameDate } from "@/lib/game/time";
import { getManualEntry, getStepHistory } from "@/lib/steps/service";
import { getStravaStatus } from "@/lib/strava/service";

export const metadata: Metadata = { title: "Activité" };

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ strava?: string }>;

export default async function ActivityPage({ searchParams }: { searchParams: SearchParams }) {
  const { session } = await requireViewer();
  const { strava: stravaNotice } = await searchParams;
  const today = gameDate();
  const [entry, history, creature, raw, strava] = await Promise.all([
    getManualEntry(session.user.id, today),
    getStepHistory(session.user.id, 14, today),
    loadActiveCreatureView(session.user.id),
    getActiveCreature(session.user.id),
    getStravaStatus(session.user.id),
  ]);
  const chest = raw && raw.status === "alive" && creature?.status === "alive" ? await getChestStatus(raw) : null;

  return (
    <div className="space-y-5 animate-rise">
      <PageHeader title="Activité" subtitle="Tes pas, jour après jour." />

      <Card>
        <StepsForm initialSteps={entry?.steps ?? 0} />
      </Card>

      {creature?.status === "egg" ? (
        <Card className="flex gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-sage-800/40 text-sage-300">
            <Egg className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <CardTitle className="text-base">Éclosion : {Math.round(creature.hatchProgress * 100)} %</CardTitle>
            <CardText className="mt-1">
              {creature.eggSteps.toLocaleString("fr-FR")} pas sur {creature.hatchSteps.toLocaleString("fr-FR")} depuis le
              choix de l&apos;œuf.
            </CardText>
          </div>
        </Card>
      ) : creature?.status === "alive" ? (
        <Card className="flex gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-sage-800/40 text-sage-300">
            <Sparkles className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <CardTitle className="text-base">Chaque 1 000 pas renforce {creature.name}</CardTitle>
            <CardText className="mt-1">
              +{STEPS.healthPerThousandSteps} santé (max +{STEPS.maxHealthPerDay} par jour) et +{STEPS.xpPerThousandSteps} XP.
              Tous les {STEPS.stepsPerAccessory.toLocaleString("fr-FR")} pas : un coffre d&apos;accessoire.
            </CardText>
          </div>
        </Card>
      ) : null}

      {chest ? <ChestOpener status={chest} canEquip={Boolean(creature?.name)} /> : null}

      <Card>
        <CardTitle className="text-lg">14 derniers jours</CardTitle>
        <StepsHistory history={history} className="mt-4" />
      </Card>

      <StravaCard configured={getConfigStatus().strava} status={strava} notice={stravaNotice ?? null} />
    </div>
  );
}
