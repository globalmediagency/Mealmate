import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CreatureHome } from "@/components/game/creature-home";
import { EggChoice } from "@/components/game/egg-choice";
import { HatchReveal } from "@/components/game/hatch-reveal";
import { Incubation } from "@/components/game/incubation";
import { StepsHistory } from "@/components/game/steps-history";
import { BottomNav } from "@/components/layout/bottom-nav";
import { Card, CardTitle } from "@/components/ui/card";
import { playableTiers, speciesByTierAll, toSpeciesSummary, getSpecies } from "@/lib/creatures";
import type { CreatureView } from "@/lib/game/creature-view";
import { creatureLine } from "@/lib/game/dialogue";
import { gameDate, shiftDate } from "@/lib/game/time";
import { isDevGalleryEnabled } from "@/lib/env";

export const metadata: Metadata = { title: "Écrans (démo)" };
export const dynamic = "force-dynamic";

const SCREENS = ["egg", "incubation", "ready", "reveal", "home", "home-sick", "activity"] as const;
type Screen = (typeof SCREENS)[number];

function mockCreature(overrides: Partial<CreatureView>): CreatureView {
  const species = getSpecies("facile-chat-rond")!;
  return {
    id: "demo",
    status: "alive",
    tier: "facile",
    name: "Miso",
    species: toSpeciesSummary(species),
    rarity: species.rarity,
    eggSteps: 15000,
    hatchSteps: 15000,
    hatchProgress: 1,
    canHatch: false,
    health: 88,
    hunger: 35,
    mood: 72,
    xp: 60,
    stage: { id: "enfant", label: "Enfant", minXp: 150 },
    xpToNextStage: 90,
    state: "healthy",
    ageDays: 4,
    createdAt: new Date().toISOString(),
    hatchedAt: new Date().toISOString(),
    diedAt: null,
    lifespanDays: null,
    ...overrides,
  };
}

export default async function DevScreensPage({ searchParams }: { searchParams: Promise<{ screen?: string }> }) {
  if (!isDevGalleryEnabled()) notFound();
  const { screen: raw } = await searchParams;
  const screen: Screen = SCREENS.includes(raw as Screen) ? (raw as Screen) : "home";

  let content: React.ReactNode;
  switch (screen) {
    case "egg":
      content = <EggChoice speciesByTier={speciesByTierAll()} obtainedSpeciesIds={["facile-lapin-doux"]} playableTiers={playableTiers()} />;
      break;
    case "incubation":
      content = (
        <Incubation
          creature={mockCreature({ status: "egg", name: null, species: null, rarity: null, eggSteps: 8200, hatchProgress: 8200 / 15000, canHatch: false })}
          todaySteps={3200}
        />
      );
      break;
    case "ready":
      content = (
        <Incubation
          creature={mockCreature({ status: "egg", name: null, species: null, rarity: null, eggSteps: 15400, hatchProgress: 1, canHatch: true })}
          todaySteps={9000}
        />
      );
      break;
    case "reveal": {
      const species = getSpecies("facile-chat-aurore")!;
      content = <HatchReveal creature={mockCreature({ name: null, species: toSpeciesSummary(species), rarity: species.rarity, ageDays: 0 })} />;
      break;
    }
    case "home-sick": {
      const c = mockCreature({ health: 22, hunger: 85, mood: 30, state: "sick", stage: { id: "adulte", label: "Adulte", minXp: 500 }, xp: 620, xpToNextStage: 580 });
      content = <CreatureHome creature={c} line={creatureLine(c)} />;
      break;
    }
    case "activity": {
      const today = gameDate();
      const history = Array.from({ length: 14 }, (_, i) => ({ date: shiftDate(today, i - 13), steps: [4200, 0, 6100, 9800, 3000, 12000, 7500, 0, 5400, 8800, 2300, 10400, 6600, 4100][i] }));
      content = (
        <Card>
          <CardTitle className="text-lg">14 derniers jours</CardTitle>
          <StepsHistory history={history} className="mt-4" />
        </Card>
      );
      break;
    }
    default: {
      const c = mockCreature({});
      content = <CreatureHome creature={c} line={creatureLine(c)} />;
    }
  }

  return (
    <div className="min-h-dvh pb-nav">
      <main className="mx-auto w-full max-w-md px-4 pt-3 safe-top">
        <nav className="mb-3 flex flex-wrap gap-1 text-xs">
          {SCREENS.map((s) => (
            <Link key={s} href={`/dev/screens?screen=${s}`} className={s === screen ? "rounded-lg bg-sage-800/50 px-2 py-1 text-sage-200" : "rounded-lg px-2 py-1 text-cream-500"}>
              {s}
            </Link>
          ))}
        </nav>
        {content}
      </main>
      <BottomNav />
    </div>
  );
}
