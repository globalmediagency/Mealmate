import type { Metadata } from "next";
import { CreatureHome } from "@/components/game/creature-home";
import { EggChoice } from "@/components/game/egg-choice";
import { HatchReveal } from "@/components/game/hatch-reveal";
import { Incubation } from "@/components/game/incubation";
import { Mourning } from "@/components/game/mourning";
import { requireViewer } from "@/lib/auth/session";
import { playableTiers, speciesByTierAll } from "@/lib/creatures";
import { loadActiveCreatureView } from "@/lib/creatures/loader";
import { getObtainedSpeciesIds, getUnmournedDeath } from "@/lib/creatures/service";
import { toCreatureView } from "@/lib/game/creature-view";
import { creatureLine } from "@/lib/game/dialogue";
import { gameDate } from "@/lib/game/time";
import { getManualEntry } from "@/lib/steps/service";

export const metadata: Metadata = { title: "Ma créature" };

export default async function HomePage() {
  const { session } = await requireViewer();
  const creature = await loadActiveCreatureView(session.user.id);

  if (creature?.status === "dead") {
    return <Mourning creature={creature} />;
  }

  if (!creature) {
    const unmourned = await getUnmournedDeath(session.user.id);
    if (unmourned) return <Mourning creature={toCreatureView(unmourned)} />;
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
