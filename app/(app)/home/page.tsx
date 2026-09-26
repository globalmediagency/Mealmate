import type { Metadata } from "next";
import type { ReactNode } from "react";
import { BoardedAway } from "@/components/game/boarded-away";
import { BoardingProposals, OwnerBoardingNotices } from "@/components/game/boarding-notices";
import { CreatureHome } from "@/components/game/creature-home";
import { EggChoice } from "@/components/game/egg-choice";
import { GiftsNotice } from "@/components/game/gifts-notice";
import { HatchReveal } from "@/components/game/hatch-reveal";
import { HostedCreatures } from "@/components/game/hosted-creatures";
import { HostedDeathNotice } from "@/components/game/hosted-death-notice";
import { Incubation } from "@/components/game/incubation";
import { Mourning } from "@/components/game/mourning";
import { requireViewer } from "@/lib/auth/session";
import { diedInBoarding, getHeldCreatures, listOwnerNotices, listProposalsFor, listUnseenDeathsHosted, toBoardingView } from "@/lib/boarding/service";
import { hostedCreatureViews } from "@/lib/boarding/views";
import { playableTiers, speciesByTierAll } from "@/lib/creatures";
import { discoverableSpecies, getDisabledSpecies } from "@/lib/game/species-service";
import { TIERS, type Tier } from "@/lib/game/config";
import { getObtainedSpeciesIds, getUnmournedDeath, refreshEggSteps } from "@/lib/creatures/service";
import { getChestStatus, getOutfit, outfitToEquipped } from "@/lib/accessories/service";
import { toCreatureView } from "@/lib/game/creature-view";
import { creatureLine } from "@/lib/game/dialogue";
import { getGameRules } from "@/lib/game/rules-service";
import { gameDate } from "@/lib/game/time";
import { countMealsToday } from "@/lib/meals/service";
import { countPlaysToday } from "@/lib/play/service";
import { getInventory, listUnseenGifts } from "@/lib/shop/service";
import { getManualEntry, sumStepsSince } from "@/lib/steps/service";

export const metadata: Metadata = { title: "Ma créature" };

export default async function HomePage() {
  const { session } = await requireViewer();
  const now = new Date();
  const [rules, gifts] = await Promise.all([getGameRules(), listUnseenGifts(session.user.id)]);
  // Own creature (ticked), its stay at a friend's if any, and the creatures friends entrusted to the user.
  const held = await getHeldCreatures(session.user.id, now, rules);
  const [hosted, deaths, proposals, ownerNotices] = await Promise.all([
    hostedCreatureViews(held.boarded, now, rules),
    listUnseenDeathsHosted(session.user.id),
    listProposalsFor(session.user.id, now, rules),
    listOwnerNotices(session.user.id, now),
  ]);
  const raw = held.own;
  const creature = raw ? toCreatureView(raw.status === "egg" ? await refreshEggSteps(raw) : raw, now, rules) : null;
  // Gifts and boarded creatures can show up whatever the own creature's state: they frame every screen.
  const frame = (screen: ReactNode, options: { gifts?: boolean } = { gifts: true }) => {
    const notice = options.gifts && gifts.length > 0 ? <GiftsNotice gifts={gifts} creatureName={creature?.status === "alive" ? creature.name ?? undefined : undefined} /> : null;
    const losses = deaths.length > 0 ? <HostedDeathNotice deaths={deaths} /> : null;
    const asked = proposals.length > 0 ? <BoardingProposals proposals={proposals.map((p) => ({ boarding: p.boarding, creature: toCreatureView(p.creature, now, rules), ownerName: p.owner.username }))} /> : null;
    const mine =
      held.proposal || ownerNotices.length > 0 ? (
        <OwnerBoardingNotices
          proposal={held.proposal ? { boarding: toBoardingView(held.proposal, now), host: held.proposal.host.username, creatureName: creature?.name ?? "ta créature" } : null}
          notices={ownerNotices}
        />
      ) : null;
    // The creatures a friend entrusted come first, as a compact strip: the host sees a sick guest without scrolling.
    const list = hosted.length > 0 ? <HostedCreatures items={hosted} variant="strip" /> : null;
    if (!notice && !losses && !asked && !mine && !list) return screen;
    return (
      <div className="space-y-4">
        {notice}
        {losses}
        {asked}
        {mine}
        {list}
        {screen}
      </div>
    );
  };

  if (creature?.status === "dead") {
    return frame(<Mourning creature={creature} boardedWith={(await diedInBoarding(creature.id))?.username ?? null} />);
  }

  if (!creature) {
    const unmourned = await getUnmournedDeath(session.user.id);
    if (unmourned) return frame(<Mourning creature={toCreatureView(unmourned, now, rules)} boardedWith={(await diedInBoarding(unmourned.id))?.username ?? null} />);
    const [obtained, disabledSpecies] = await Promise.all([getObtainedSpeciesIds(session.user.id), getDisabledSpecies()]);
    const all = speciesByTierAll();
    const owned = new Set(obtained);
    const speciesByTier = Object.fromEntries(TIERS.map((tier) => [tier, discoverableSpecies(all[tier], disabledSpecies, owned)])) as Record<Tier, typeof all[Tier]>;
    const hiddenByTier = Object.fromEntries(TIERS.map((tier) => [tier, all[tier].length - speciesByTier[tier].length])) as Record<Tier, number>;
    return frame(
      <EggChoice
        speciesByTier={speciesByTier}
        hiddenSpeciesByTier={hiddenByTier}
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
    return frame(<BoardedAway creature={creature} accessories={outfitToEquipped(outfit)} boarding={toBoardingView(held.away, now)} host={held.away.host} creatureSize={rules.home.creatureSize} />);
  }

  const today = gameDate();
  const [outfit, chest, inventory, stepsToday, plays, meals] = await Promise.all([
    getOutfit(creature.id),
    raw ? getChestStatus(raw) : null,
    getInventory(session.user.id),
    sumStepsSince(session.user.id, today).catch(() => null),
    countPlaysToday(creature.id).catch(() => null),
    countMealsToday(session.user.id, today).catch(() => null),
  ]);
  return frame(
    <CreatureHome
      creature={creature}
      line={creatureLine(creature)}
      accessories={outfitToEquipped(outfit)}
      chest={chest}
      todaySteps={stepsToday}
      inventory={inventory}
      gifts={gifts}
      playsLeft={plays === null ? null : Math.max(0, rules.play.maxPerDay - plays)}
      mealsToday={meals}
      maxMeals={rules.feeding.maxMealsPerDay}
      home={rules.home}
    />,
    { gifts: false },
  );
}
