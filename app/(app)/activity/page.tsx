import type { Metadata } from "next";
import { Activity, Egg, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { StepsForm } from "@/components/game/steps-form";
import { StepsHistory } from "@/components/game/steps-history";
import { Button } from "@/components/ui/button";
import { Card, CardText, CardTitle } from "@/components/ui/card";
import { requireViewer } from "@/lib/auth/session";
import { loadActiveCreatureView } from "@/lib/creatures/loader";
import { STEPS } from "@/lib/game/config";
import { gameDate } from "@/lib/game/time";
import { getManualEntry, getStepHistory } from "@/lib/steps/service";

export const metadata: Metadata = { title: "Activité" };

export default async function ActivityPage() {
  const { session } = await requireViewer();
  const today = gameDate();
  const [entry, history, creature] = await Promise.all([
    getManualEntry(session.user.id, today),
    getStepHistory(session.user.id, 14, today),
    loadActiveCreatureView(session.user.id),
  ]);

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
              Tous les {STEPS.stepsPerAccessory.toLocaleString("fr-FR")} pas : un accessoire (bientôt).
            </CardText>
          </div>
        </Card>
      ) : null}

      <Card>
        <CardTitle className="text-lg">14 derniers jours</CardTitle>
        <StepsHistory history={history} className="mt-4" />
      </Card>

      <Button variant="secondary" disabled>
        <Activity className="h-5 w-5" aria-hidden="true" />
        Connecter Strava · bientôt
      </Button>
    </div>
  );
}
