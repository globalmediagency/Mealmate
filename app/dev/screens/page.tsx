import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BoardedAway } from "@/components/game/boarded-away";
import { CreatureHome } from "@/components/game/creature-home";
import { HostedCreatures } from "@/components/game/hosted-creatures";
import { HostedDeathNotice } from "@/components/game/hosted-death-notice";
import { CoachingPanel } from "@/components/game/coaching-panel";
import { StudentMeals } from "@/components/game/student-meals";
import { SocialTabs } from "@/components/game/social-tabs";
import { PensionHome } from "@/components/game/pension-home";
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
import { FriendsPanel } from "@/components/game/friends-panel";
import { ShopPanel } from "@/components/shop/shop-panel";
import { StravaCard } from "@/components/game/strava-card";
import { DangerZone } from "@/components/account/danger-zone";
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

const SCREENS = ["egg", "incubation", "ready", "reveal", "home", "home-sick", "home-hungry", "activity", "feed", "meal-result", "meals", "mourning", "admin", "play", "wardrobe", "chest", "collection", "friends", "shop", "home-protected", "account", "home-away", "home-hosting", "pension", "mourning-pension", "coach", "coach-meals"] as const;
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
        <div className="space-y-4">
          <Card>
            <CardTitle className="text-lg">14 derniers jours</CardTitle>
            <StepsHistory history={history} className="mt-4" />
          </Card>
          <StravaCard configured status={{ connected: true, athleteId: 4242, athleteName: "Camille", lastSyncAt: new Date(Date.now() - 3_600_000).toISOString(), nextSyncAt: null }} notice="connected" />
          <StravaCard configured status={{ connected: false, athleteId: null, athleteName: null, lastSyncAt: null, nextSyncAt: null }} />
          <StravaCard configured={false} status={{ connected: false, athleteId: null, athleteName: null, lastSyncAt: null, nextSyncAt: null }} />
        </div>
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
        { id: "m1", imageUrl: img, score: 82, verdict: "sain", foods: ["saumon grillé", "quinoa", "avocat"], macros: { proteins: 4, fibers: 4, carbs: 3, fats: 3, sugars: 1, ultra_processed: 1 }, portion: "raisonnable", comment: "Une assiette équilibrée. Bravo !", creatureLine: "Miam, du saumon !", healthDelta: 10.5, photoSource: "screen", createdAt: new Date().toISOString(), review: "up" },
        { id: "m2", imageUrl: img, score: 38, verdict: "peu_sain", foods: ["burger", "frites"], macros: { proteins: 3, fibers: 1, carbs: 4, fats: 2, sugars: 2, ultra_processed: 4 }, portion: "copieuse", comment: "Un plaisir de temps en temps ; un peu de verdure à côté la prochaine fois ?", creatureLine: "Ouh, c'est lourd…", healthDelta: -0.5, photoSource: "real", createdAt: new Date(Date.now() - 86_400_000).toISOString(), review: "down" },
        { id: "m3", imageUrl: img, score: 64, verdict: "correct", foods: ["pâtes", "tomates", "parmesan"], macros: { proteins: 2, fibers: 2, carbs: 4, fats: 2, sugars: 1, ultra_processed: 2 }, portion: "raisonnable", comment: "Correct ! Des légumes en plus et c'est parfait.", creatureLine: "Des pâtes, chouette.", healthDelta: 6, photoSource: "real", createdAt: new Date(Date.now() - 2 * 86_400_000).toISOString(), review: null },
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
          counts={{ straw_hat: 2, beret: 3 }}
        />
      );
      break;
    case "friends": {
      const now = new Date().toISOString();
      content = (
        <FriendsPanel
          me={{ username: "Chabond_42", friendCode: "MM-7K3Q2X" }}
          inventory={{ sirop: 2, antibiotique: 1, talisman: 0 }}
          boardable={{ creatureName: "Miso", maxDays: 30, durations: [3, 7, 14, 21, 30] }}
          demoTrade={{
            friend: { userId: "u1", username: "Marion" },
            mine: ACCESSORIES.filter((a) => ["beret", "scarf", "sunglasses"].includes(a.id)).map((a) => ({ accessory: a, qty: a.id === "scarf" ? 2 : 1 })),
            theirs: ACCESSORIES.filter((a) => ["crown", "monocle", "scarf"].includes(a.id)).map((a) => ({ accessory: a, qty: 1 })),
          }}
          trades={{
            incoming: [{ id: "33333333-3333-4333-8333-333333333333", direction: "incoming", other: { userId: "u1", username: "Marion" }, offered: ACCESSORIES.find((a) => a.id === "crown")!, requested: ACCESSORIES.find((a) => a.id === "beret")!, status: "pending", createdAt: now, resolvedAt: null }],
            outgoing: [{ id: "44444444-4444-4444-8444-444444444444", direction: "outgoing", other: { userId: "u2", username: "Karim" }, offered: ACCESSORIES.find((a) => a.id === "scarf")!, requested: ACCESSORIES.find((a) => a.id === "sunglasses")!, status: "pending", createdAt: now, resolvedAt: null }],
            recent: [{ id: "55555555-5555-4555-8555-555555555555", direction: "outgoing", other: { userId: "u1", username: "Marion" }, offered: ACCESSORIES.find((a) => a.id === "cap")!, requested: ACCESSORIES.find((a) => a.id === "monocle")!, status: "accepted", createdAt: now, resolvedAt: now }],
          }}
          incoming={[{ id: "11111111-1111-4111-8111-111111111111", user: { userId: "u9", username: "Lina" }, createdAt: now }]}
          outgoing={[{ id: "22222222-2222-4222-8222-222222222222", user: { userId: "u8", username: "Tom_92" }, createdAt: now }]}
          friends={[
            { friendshipId: "a", since: now, user: { userId: "u1", username: "Marion" }, creature: { status: "alive", tier: "moyen", name: "Roux", species: toSpeciesSummary(getSpecies("moyen-renard-malin")!), rarity: "commun", stage: "adulte", state: "healthy", health: 92, ageDays: 12, accessories: [{ slot: "head", id: "beret" }] } },
            { friendshipId: "b", since: now, user: { userId: "u2", username: "Karim" }, creature: { status: "alive", tier: "difficile", name: "Azur", species: toSpeciesSummary(getSpecies("difficile-dragon-celeste")!), rarity: "legendaire", stage: "enfant", state: "sick", health: 24, ageDays: 3, accessories: [] } },
            { friendshipId: "c", since: now, user: { userId: "u3", username: "Sophie" }, creature: { status: "egg", tier: "facile", hatchProgress: 0.62 } },
            { friendshipId: "d", since: now, user: { userId: "u4", username: "Jules" }, creature: { status: "dead", tier: "facile", name: "Miso", species: toSpeciesSummary(getSpecies("facile-chat-rond")!), rarity: "commun", lifespanDays: 9 } },
            { friendshipId: "e", since: now, user: { userId: "u5", username: "Nour" }, creature: { status: "none" } },
          ]}
        />
      );
      break;
    }
    case "shop":
      content = (
        <ShopPanel
          inventory={{ sirop: 2, antibiotique: 0, talisman: 1 }}
          purchases={[
            { id: "p1", item: "sirop", amountCents: 199, status: "paid", createdAt: new Date().toISOString() },
            { id: "p2", item: "talisman", amountCents: 599, status: "cancelled", createdAt: new Date(Date.now() - 86_400_000).toISOString() },
          ]}
          stripeEnabled
          webhookMissing={false}
          testMode
          creature={{ name: "Miso", health: 52 }}
          checkout={{ success: false, cancelled: false, sessionId: null }}
        />
      );
      break;
    case "home-protected": {
      const c = mockCreature({ health: 41, state: "tired", protectedUntil: new Date(Date.now() + 5 * 86_400_000).toISOString() });
      content = (
        <CreatureHome
          creature={c}
          line={creatureLine(c)}
          doses={2}
          gifts={[
            { id: "g1", from: { userId: "u1", username: "Marion" }, kind: "medicine", item: "antibiotique", createdAt: new Date().toISOString() },
            { id: "g2", from: { userId: "u2", username: "Karim" }, kind: "accessory", accessory: ACCESSORIES.find((a) => a.id === "crown")!, createdAt: new Date().toISOString() },
          ]}
        />
      );
      break;
    }
    case "home-away": {
      const endsAt = new Date(Date.now() + 9 * 86_400_000).toISOString();
      content = (
        <BoardedAway
          creature={mockCreature({ hunger: 35, health: 88 })}
          accessories={[{ slot: "head", id: "straw_hat" }]}
          boarding={{ id: "66666666-6666-4666-8666-666666666666", creatureId: "demo", startedAt: new Date().toISOString(), endsAt, daysLeft: 9, seen: true }}
          host={{ userId: "u2", username: "Karim" }}
        />
      );
      break;
    }
    case "home-hosting": {
      const endsAt = new Date(Date.now() + 5 * 86_400_000).toISOString();
      const azur = mockCreature({ id: "demo-azur", name: "Azur", tier: "difficile", species: toSpeciesSummary(getSpecies("difficile-dragon-celeste")!), rarity: "legendaire", health: 24, hunger: 82, state: "sick" });
      const roux = mockCreature({ id: "demo-roux", name: "Roux", tier: "moyen", species: toSpeciesSummary(getSpecies("moyen-renard-malin")!), health: 92, hunger: 20 });
      content = (
        <div className="space-y-4">
          <HostedDeathNotice deaths={[{ boardingId: "99999999-9999-4999-8999-999999999999", creatureName: "Pixel", ownerName: "Sophie", diedAt: new Date().toISOString() }]} />
          <CreatureHome creature={mockCreature({})} line={creatureLine(mockCreature({}))} chestsAvailable={1} />
          <HostedCreatures
            items={[
              { boarding: { id: "77777777-7777-4777-8777-777777777777", creatureId: azur.id, startedAt: new Date().toISOString(), endsAt, daysLeft: 5, seen: false }, creature: azur, accessories: [], owner: { userId: "u2", username: "Karim" } },
              { boarding: { id: "88888888-8888-4888-8888-888888888888", creatureId: roux.id, startedAt: new Date().toISOString(), endsAt, daysLeft: 12, seen: true }, creature: roux, accessories: [{ slot: "head", id: "beret" }], owner: { userId: "u1", username: "Marion" } },
            ]}
          />
        </div>
      );
      break;
    }
    case "pension": {
      const endsAt = new Date(Date.now() + 5 * 86_400_000).toISOString();
      const azur = mockCreature({ id: "demo-azur", name: "Azur", tier: "difficile", species: toSpeciesSummary(getSpecies("difficile-dragon-celeste")!), rarity: "legendaire", health: 24, hunger: 82, state: "sick", sickSince: new Date().toISOString(), daysUntilDeath: 2.5 });
      content = (
        <PensionHome
          creature={azur}
          accessories={[{ slot: "neck", id: "scarf" }]}
          boarding={{ id: "77777777-7777-4777-8777-777777777777", creatureId: azur.id, startedAt: new Date().toISOString(), endsAt, daysLeft: 5, seen: true }}
          owner={{ userId: "u2", username: "Karim" }}
          inventory={{ sirop: 2, antibiotique: 1, talisman: 0 }}
          chest={{ totalSteps: 12_400, earned: 2, opened: 1, available: 1, stepsToNext: 2_600, stepsPerChest: 5_000 }}
        />
      );
      break;
    }
    case "account":
      content = (
        <div className="space-y-4">
          <DangerZone hasPassword />
          <DangerZone hasPassword={false} />
        </div>
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
    case "coach": {
      const now = new Date().toISOString();
      content = (
        <div className="space-y-5">
          <SocialTabs coachingBadge={1} />
          <CoachingPanel
            me={{ username: "Chabond_42" }}
            current={{ id: "c1111111-1111-4111-8111-111111111111", status: "active", student: { userId: "me", username: "Chabond_42" }, coach: { userId: "u2", username: "Karim" }, thumbsUp: 7, thumbsDown: 2, createdAt: now, respondedAt: now, endedAt: null, endedBy: null }}
            notices={[{ id: "c1111111-1111-4111-8111-111111111111", status: "active", student: { userId: "me", username: "Chabond_42" }, coach: { userId: "u2", username: "Karim" }, thumbsUp: 7, thumbsDown: 2, createdAt: now, respondedAt: now, endedAt: null, endedBy: null }]}
            friends={[{ friendshipId: "a", username: "Marion" }, { friendshipId: "b", username: "Karim" }]}
            proposals={[{ id: "c2222222-2222-4222-8222-222222222222", status: "pending", student: { userId: "u9", username: "Lina" }, coach: { userId: "me", username: "Chabond_42" }, thumbsUp: 0, thumbsDown: 0, createdAt: now, respondedAt: null, endedAt: null, endedBy: null }]}
            students={[{ id: "c3333333-3333-4333-8333-333333333333", status: "active", student: { userId: "u1", username: "Marion" }, coach: { userId: "me", username: "Chabond_42" }, thumbsUp: 12, thumbsDown: 3, createdAt: now, respondedAt: now, endedAt: null, endedBy: null }]}
            rewards={{ student: { points: 5, per: 5, earned: 1, opened: 0, available: 1, toNext: 5 }, coach: { points: 15, per: 10, earned: 1, opened: 1, available: 0, toNext: 5 } }}
          />
        </div>
      );
      break;
    }
    case "coach-meals": {
      const now = new Date().toISOString();
      const img = "data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#5e7053"/><circle cx="32" cy="32" r="18" fill="#e8c36a"/></svg>');
      const meal = (id: string, score: number, verdict: "sain" | "correct" | "peu_sain", foods: string[], review: "up" | "down" | null, hoursAgo: number) => ({
        id, imageUrl: img, score, verdict, foods, macros: { proteins: 3, fibers: 3, carbs: 3, fats: 2, sugars: 1, ultra_processed: 1 }, portion: "raisonnable", comment: "Une assiette équilibrée, bravo.", creatureLine: null, healthDelta: 4, photoSource: "real" as const, createdAt: new Date(Date.now() - hoursAgo * 3_600_000).toISOString(), review,
      });
      content = (
        <StudentMeals
          coaching={{ id: "c3333333-3333-4333-8333-333333333333", status: "active", student: { userId: "u1", username: "Marion" }, coach: { userId: "me", username: "Chabond_42" }, thumbsUp: 12, thumbsDown: 3, createdAt: now, respondedAt: now, endedAt: null, endedBy: null }}
          meals={[meal("m1", 84, "sain", ["saumon", "quinoa", "brocolis"], "up", 2), meal("m2", 41, "peu_sain", ["pizza", "soda"], "down", 26), meal("m3", 66, "correct", ["pâtes", "tomates"], null, 50)]}
          retentionDays={30}
          thumbsPerReward={5}
        />
      );
      break;
    }
    case "mourning-pension":
      content = <Mourning creature={mockCreature({ status: "dead", state: "dead", health: 0, hunger: 100, mood: 5, ageDays: 9, lifespanDays: 9, diedAt: new Date().toISOString() })} boardedWith="Karim" />;
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
