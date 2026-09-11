import type { Metadata } from "next";
import type { ReactNode } from "react";
import { CreatureHome } from "@/components/game/creature-home";
import { EggChoice } from "@/components/game/egg-choice";
import { GiftsNotice } from "@/components/game/gifts-notice";
import { HatchReveal } from "@/components/game/hatch-reveal";
import { Incubation } from "@/components/game/incubation";
import { Mourning } from "@/components/game/mourning";
import { requireViewer } from "@/lib/auth/session";
import { playableTiers, speciesByTierAll } from "@/lib/creatures";
import { loadActiveCreatureView } from "@/lib/creatures/loader";
import { getActiveCreature, getObtainedSpeciesIds, getUnmournedDeath } from "@/lib/creatures/service";
import { getChestStatus, getOutfit, outfitToEquipped } from "@/lib/accessories/service";
import { toCreatureView } from "@/lib/game/creature-view";
import { creatureLine } from "@/lib/game/dialogue";
import { getGameRules } from "@/lib/game/rules-service";
import { gameDate } from "@/lib/game/time";
import { getInventory, listUnseenGifts, totalDoses } from "@/lib/shop/service";
import { getManualEntry } from "@/lib/steps/service";

export const metadata: Metadata = { title: "Ma créature" };

export default async function HomePage() {
  const { session } = await requireViewer();
  const [creature, gifts] = await Promise.all([loadActiveCreatureView(session.user.id), listUnseenGifts(session.user.id)]);
  // Gifts (accessories, medicine) can arrive whatever the creature's state: the notice is shown on every screen.
  const withGifts = (screen: ReactNode) =>
    gifts.length > 0 ? (
      <div className="space-y-4">
        <GiftsNotice gifts={gifts} creatureName={creature?.status === "alive" ? creature.name ?? undefined : undefined} />
        {screen}
      </div>
    ) : (
      screen
    );

  if (creature?.status === "dead") {
    return withGifts(<Mourning creature={creature} />);
  }

  if (!creature) {
    const unmourned = await getUnmournedDeath(session.user.id);
    if (unmourned) return withGifts(<Mourning creature={toCreatureView(unmourned, new Date(), await getGameRules())} />);
    const [obtained, rules] = await Promise.all([getObtainedSpeciesIds(session.user.id), getGameRules()]);
    return withGifts(
      <EggChoice
        speciesByTier={speciesByTierAll()}
        obtainedSpeciesIds={obtained}
        playableTiers={playableTiers()}
        rules={rules}
        intro={obtained.length > 0 ? "Un nouveau compagnon t'attend. Choisis librement le niveau de ton prochain œuf." : undefined}
      />,
    );
  }

  if (creature.status === "egg") {
    const entry = await getManualEntry(session.user.id, gameDate());
    return withGifts(<Incubation creature={creature} todaySteps={entry?.steps ?? 0} />);
  }

  if (!creature.name) {
    return withGifts(<HatchReveal creature={creature} />);
  }

  const raw = await getActiveCreature(session.user.id);
  const [outfit, chest, inventory] = await Promise.all([getOutfit(creature.id), raw ? getChestStatus(raw) : null, getInventory(session.user.id)]);
  return (
    <CreatureHome
      creature={creature}
      line={creatureLine(creature)}
      accessories={outfitToEquipped(outfit)}
      chestsAvailable={chest?.available ?? 0}
      doses={totalDoses(inventory)}
      gifts={gifts}
    />
  );
}
