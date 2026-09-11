import type { Metadata } from "next";
import type { ReactNode } from "react";
import { BoardedAway } from "@/components/game/boarded-away";
import { CreatureHome } from "@/components/game/creature-home";
import { EggChoice } from "@/components/game/egg-choice";
import { GiftsNotice } from "@/components/game/gifts-notice";
import { HatchReveal } from "@/components/game/hatch-reveal";
import { HostedCreatures } from "@/components/game/hosted-creatures";
import { HostedDeathNotice } from "@/components/game/hosted-death-notice";
import { Incubation } from "@/components/game/incubation";
import { Mourning } from "@/components/game/mourning";
import { requireViewer } from "@/lib/auth/session";
import { diedInBoarding, getHeldCreatures, listUnseenDeathsHosted, toBoardingView } from "@/lib/boarding/service";
import { hostedCreatureViews } from "@/lib/boarding/views";
import { playableTiers, speciesByTierAll } from "@/lib/creatures";
import { getObtainedSpeciesIds, getUnmournedDeath, refreshEggSteps } from "@/lib/creatures/service";
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
  const now = new Date();
  const [rules, gifts] = await Promise.all([getGameRules(), listUnseenGifts(session.user.id)]);
  // Own creature (ticked), its stay at a friend's if any, and the creatures friends entrusted to the user.
  const held = await getHeldCreatures(session.user.id, now, rules);
  const [hosted, deaths] = await Promise.all([hostedCreatureViews(held.boarded, now, rules), listUnseenDeathsHosted(session.user.id)]);
  const raw = held.own;
  const creature = raw ? toCreatureView(raw.status === "egg" ? await refreshEggSteps(raw) : raw, now, rules) : null;
  // Gifts and boarded creatures can show up whatever the own creature's state: they frame every screen.
  const frame = (screen: ReactNode, options: { gifts?: boolean } = { gifts: true }) => {
    const notice = options.gifts && gifts.length > 0 ? <GiftsNotice gifts={gifts} creatureName={creature?.status === "alive" ? creature.name ?? undefined : undefined} /> : null;
    const losses = deaths.length > 0 ? <HostedDeathNotice deaths={deaths} /> : null;
    const list = hosted.length > 0 ? <HostedCreatures items={hosted} /> : null;
    if (!notice && !losses && !list) return screen;
    return (
      <div className="space-y-4">
        {notice}
        {losses}
        {screen}
        {list}
      </div>
    );
  };

  if (creature?.status === "dead") {
    return frame(<Mourning creature={creature} boardedWith={(await diedInBoarding(creature.id))?.username ?? null} />);
  }

  if (!creature) {
    const unmourned = await getUnmournedDeath(session.user.id);
    if (unmourned) return frame(<Mourning creature={toCreatureView(unmourned, now, rules)} boardedWith={(await diedInBoarding(unmourned.id))?.username ?? null} />);
    const obtained = await getObtainedSpeciesIds(session.user.id);
    return frame(
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
    return frame(<Incubation creature={creature} todaySteps={entry?.steps ?? 0} />);
  }

  if (!creature.name) {
    return frame(<HatchReveal creature={creature} />);
  }

  if (held.away) {
    const outfit = await getOutfit(creature.id);
    return frame(<BoardedAway creature={creature} accessories={outfitToEquipped(outfit)} boarding={toBoardingView(held.away, now)} host={held.away.host} />);
  }

  const [outfit, chest, inventory] = await Promise.all([getOutfit(creature.id), raw ? getChestStatus(raw) : null, getInventory(session.user.id)]);
  return frame(
    <CreatureHome
      creature={creature}
      line={creatureLine(creature)}
      accessories={outfitToEquipped(outfit)}
      chestsAvailable={chest?.available ?? 0}
      doses={totalDoses(inventory)}
      gifts={gifts}
    />,
    { gifts: false },
  );
}
