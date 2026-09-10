import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CreatureHome } from "@/components/game/creature-home";
import { EggChoice } from "@/components/game/egg-choice";
import { HatchReveal } from "@/components/game/hatch-reveal";
import { Incubation } from "@/components/game/incubation";
import { StepsHistory } from "@/components/game/steps-history";
import { FeedFlow } from "@/components/game/feed-flow";
import { MealResult } from "@/components/game/meal-result";
import { MealsHistory } from "@/components/game/meals-history";
import { Mourning } from "@/components/game/mourning";
import type { MealStats, MealView } from "@/lib/meals/service";
import { RulesForm } from "@/components/admin/rules-form";
import { FoodCatchGame } from "@/components/game/food-catch-game";
import { Wardrobe } from "@/components/game/wardrobe";
import { ChestOpener } from "@/components/game/chest-reveal";
import { ACCESSORIES } from "@/lib/accessories/catalog";
import { CollectionGrid } from "@/components/game/collection-grid";
import { BottomNav } from "@/components/layout/bottom-nav";
import { Card, CardTitle } from "@/components/ui/card";
import { playableTiers, speciesByTierAll, toSpeciesSummary, getSpecies } from "@/lib/creatures";
import type { CreatureView } from "@/lib/game/creature-view";
import { creatureLine } from "@/lib/game/dialogue";
import { DEFAULT_RULES } from "@/lib/game/rules";
import { gameDate, shiftDate } from "@/lib/game/time";
import { isDevGalleryEnabled } from "@/lib/env";

export const metadata: Metadata = { title: "Écrans (démo)" };
export const dynamic = "force-dynamic";

const SCREENS = ["egg", "incubation", "ready", "reveal", "home", "home-sick", "home-hungry", "activity", "feed", "meal-result", "meals", "mourning", "admin", "play", "wardrobe", "chest", "collection"] as const;
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
    sickSince: null,
    daysUntilDeath: null,
    protectedUntil: null,
    sickDaysBeforeDeath: 7,
    hungerDamageThreshold: 80,
    healthyScoreThreshold: 40,
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
      content = <EggChoice speciesByTier={speciesByTierAll()} obtainedSpeciesIds={["facile-lapin-doux"]} playableTiers={playableTiers()} rules={DEFAULT_RULES} />;
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
      const c = mockCreature({ health: 22, hunger: 85, mood: 30, state: "sick", stage: { id: "adulte", label: "Adulte", minXp: 500 }, xp: 620, xpToNextStage: 580, sickSince: new Date(Date.now() - 2 * 86_400_000).toISOString(), daysUntilDeath: 5 });
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
    case "feed":
      content = <FeedFlow creature={mockCreature({ hunger: 65 })} mealsToday={2} />;
      break;
    case "meal-result":
      content = (
        <Card>
          <MealResult
            creatureName="Miso"
            data={{
              score: 82,
              verdict: "sain",
              foods: ["saumon grillé", "quinoa", "avocat", "brocoli"],
              macros: { proteins: 4, fibers: 4, carbs: 3, fats: 3, sugars: 1, ultra_processed: 1 },
              portion: "raisonnable",
              comment: "Une assiette équilibrée, riche en bons gras. Bravo !",
              creatureLine: "Miam, du saumon ! Je me sens plus fort.",
              healthDelta: 10.5,
            }}
          />
        </Card>
      );
      break;
    case "meals": {
      const today = gameDate();
      const scores = [72, null, 55, 81, 90, 40, 66, 78, null, 35, 88, 61, 70, 84, 79, null, 52, 91, 68, 74, 60, 83, 77, 45, 86, 69, 73, 80, 64, 82];
      const daily = scores.map((score, i) => ({ date: shiftDate(today, i - 29), average: score, count: score === null ? 0 : 1 + (i % 2) }));
      const stats: MealStats = { daily, weekAverage: 73, monthAverage: 70, weekCount: 9, todayCount: 2 };
      const img = "data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#5e7053"/><circle cx="32" cy="32" r="18" fill="#e8c36a"/></svg>');
      const meals: MealView[] = [
        { id: "m1", imageUrl: img, score: 82, verdict: "sain", foods: ["saumon grillé", "quinoa", "avocat"], macros: { proteins: 4, fibers: 4, carbs: 3, fats: 3, sugars: 1, ultra_processed: 1 }, portion: "raisonnable", comment: "Une assiette équilibrée. Bravo !", creatureLine: "Miam, du saumon !", healthDelta: 10.5, createdAt: new Date().toISOString() },
        { id: "m2", imageUrl: img, score: 38, verdict: "peu_sain", foods: ["burger", "frites"], macros: { proteins: 3, fibers: 1, carbs: 4, fats: 2, sugars: 2, ultra_processed: 4 }, portion: "copieuse", comment: "Un plaisir de temps en temps ; un peu de verdure à côté la prochaine fois ?", creatureLine: "Ouh, c'est lourd…", healthDelta: -0.5, createdAt: new Date(Date.now() - 86_400_000).toISOString() },
        { id: "m3", imageUrl: img, score: 64, verdict: "correct", foods: ["pâtes", "tomates", "parmesan"], macros: { proteins: 2, fibers: 2, carbs: 4, fats: 2, sugars: 1, ultra_processed: 2 }, portion: "raisonnable", comment: "Correct ! Des légumes en plus et c'est parfait.", creatureLine: "Des pâtes, chouette.", healthDelta: 6, createdAt: new Date(Date.now() - 2 * 86_400_000).toISOString() },
      ];
      content = <MealsHistory meals={meals} stats={stats} tier="facile" />;
      break;
    }
    case "home-hungry": {
      const c = mockCreature({ hunger: 86, health: 74, mood: 50 });
      content = <CreatureHome creature={c} line={creatureLine(c)} />;
      break;
    }
    case "admin":
      content = <RulesForm initialRules={DEFAULT_RULES} storedPatch={{}} updatedAt={null} updatedBy={null} />;
      break;
    case "play":
      content = <FoodCatchGame creature={mockCreature({})} accessories={[{ slot: "head", id: "straw_hat" }]} playsLeft={3} />;
      break;
    case "wardrobe":
      content = (
        <Wardrobe
          creature={mockCreature({})}
          owned={ACCESSORIES.filter((a) => ["straw_hat", "beret", "round_glasses", "scarf", "bow_tie", "cape", "top_hat"].includes(a.id))}
          outfit={{ head: "straw_hat", neck: "scarf" }}
        />
      );
      break;
    case "collection":
      content = <CollectionGrid obtained={new Set(["facile-chat-rond", "facile-lapin-doux", "moyen-renard-malin", "difficile-phenix"])} />;
      break;
    case "chest":
      content = (
        <div className="space-y-4">
          <ChestOpener status={{ totalSteps: 12_300, earned: 2, opened: 0, available: 2, stepsToNext: 2_700, stepsPerChest: 5_000 }} canEquip />
          <ChestOpener status={{ totalSteps: 3_200, earned: 0, opened: 0, available: 0, stepsToNext: 1_800, stepsPerChest: 5_000 }} canEquip />
        </div>
      );
      break;
    case "mourning":
      content = <Mourning creature={mockCreature({ status: "dead", state: "dead", health: 0, hunger: 100, mood: 5, ageDays: 9, lifespanDays: 9, diedAt: new Date().toISOString() })} />;
      break;
    default: {
      const c = mockCreature({});
      content = <CreatureHome creature={c} line={creatureLine(c)} accessories={[{ slot: "head", id: "beret" }, { slot: "neck", id: "bow_tie" }]} chestsAvailable={1} />;
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
