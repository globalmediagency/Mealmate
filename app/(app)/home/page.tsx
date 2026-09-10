import type { Metadata } from "next";
import { CreatureHome } from "@/components/game/creature-home";
import { EggChoice } from "@/components/game/egg-choice";
import { HatchReveal } from "@/components/game/hatch-reveal";
import { Incubation } from "@/components/game/incubation";
import { requireViewer } from "@/lib/auth/session";
import { playableTiers, speciesByTierAll } from "@/lib/creatures";
import { loadActiveCreatureView } from "@/lib/creatures/loader";
import { getObtainedSpeciesIds } from "@/lib/creatures/service";
import { creatureLine } from "@/lib/game/dialogue";
import { gameDate } from "@/lib/game/time";
import { getManualEntry } from "@/lib/steps/service";

export const metadata: Metadata = { title: "Ma créature" };

export default async function HomePage() {
  const { session } = await requireViewer();
  const creature = await loadActiveCreatureView(session.user.id);

  if (!creature) {
    const obtained = await getObtainedSpeciesIds(session.user.id);
    return (
      <EggChoice
        speciesByTier={speciesByTierAll()}
        obtainedSpeciesIds={obtained}
        playableTiers={playableTiers()}
        intro={obtained.length > 0 ? "Un nouveau compagnon t'attend. Choisis librement le niveau de ton prochain œuf." : undefined}
      />
    );
  }

  if (creature.status === "egg") {
    const entry = await getManualEntry(session.user.id, gameDate());
    return <Incubation creature={creature} todaySteps={entry?.steps ?? 0} />;
  }

  if (!creature.name) {
    return <HatchReveal creature={creature} />;
  }

  return <CreatureHome creature={creature} line={creatureLine(creature)} />;
}
