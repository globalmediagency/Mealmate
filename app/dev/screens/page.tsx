import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BoardedAway } from "@/components/game/boarded-away";
import { BoardingProposals, OwnerBoardingNotices } from "@/components/game/boarding-notices";
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
import { PlayerCard } from "@/components/admin/player-card";
import { Creature } from "@/components/creatures/creature";
import { ArViewer } from "@/components/ar/ar-viewer";
import { Creature3dView } from "@/components/ar/three/creature-3d-view";
import { Species3dButton } from "@/components/admin/species-3d-dialog";
import { markerSvg } from "@/lib/ar/marker";
import { VIEW_COUNT, yawForView } from "@/lib/creatures/turnaround";
import { FoodIcon } from "@/components/food/food-icon";
import { SchemaOutdatedScreen } from "@/components/system/schema-outdated-screen";
import { MIGRATIONS } from "@/lib/db/migrations-catalog";
import { FOOD_KIND_LABELS, FOOD_KINDS } from "@/lib/meals/food-icons";
import { FeedAnimationDemo } from "@/components/game/feed-animation-demo";
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
import { ALL_SPECIES, playableTiers, speciesByTierAll, toSpeciesSummary, getSpecies } from "@/lib/creatures";
import { moodEffectsFor, type CreatureView } from "@/lib/game/creature-view";
import { creatureLine } from "@/lib/game/dialogue";
import { DEFAULT_RULES } from "@/lib/game/rules";
import { gameDate, shiftDate } from "@/lib/game/time";
import { isDevGalleryEnabled } from "@/lib/env";

export const metadata: Metadata = { title: "Écrans (démo)" };
export const dynamic = "force-dynamic";

const SCREENS = ["egg", "incubation", "ready", "reveal", "home", "home-sick", "home-hungry", "activity", "feed", "feed-animation", "food", "schema", "ar", "turnaround", "creature-3d", "admin-players", "meal-result", "meals", "mourning", "admin", "play", "wardrobe", "chest", "collection", "friends", "shop", "home-protected", "account", "home-away", "home-hosting", "pension", "mourning-pension", "coach", "coach-meals", "home-pending"] as const;
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
    moodBand: "happy",
    moodEffects: moodEffectsFor({ status: "alive", mood: 72 }),
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
    case "feed-animation":
      content = (
        <FeedAnimationDemo
          foods={["saumon grillé", "quinoa", "brocoli", "avocat"]}
          score={82}
          verdict="sain"
          targets={[
            { name: "Miso", speciesId: "facile-chat-rond", stageId: "enfant", state: "healthy", healthBefore: 78, healthAfter: 88.5, hungerBefore: 65, hungerAfter: 25, healthDelta: 10.5 },
            { name: "Pipo", speciesId: "moyen-renard-malin", stageId: "adulte", state: "tired", healthBefore: 52, healthAfter: 44, hungerBefore: 30, hungerAfter: 0, healthDelta: -8, ownerName: "Léa" },
          ]}
        />
      );
      break;
    case "food":
      content = (
        <Card>
          <h1 className="font-display text-2xl text-cream-50">Dessins d&apos;aliments ({FOOD_KINDS.length})</h1>
          <ul className="mt-4 grid grid-cols-4 gap-3 sm:grid-cols-6">
            {FOOD_KINDS.map((kind) => (
              <li key={kind} className="flex flex-col items-center gap-1 rounded-2xl bg-ink-900/60 p-2 text-center">
                <FoodIcon kind={kind} size={48} />
                <span className="text-[11px] text-cream-500">{FOOD_KIND_LABELS[kind]}</span>
              </li>
            ))}
          </ul>
        </Card>
      );
      break;
    case "creature-3d":
      content = (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Creature3dView speciesId="facile-panda-roux" stage="adulte" accessories={[{ slot: "head", id: "beret" }, { slot: "eyes", id: "round_glasses" }]} autoRotate={false} />
            <Creature3dView
              speciesId="facile-cochon-dinde"
              stage="adulte"
              accessories={[
                { slot: "head", id: "nightcap" },
                { slot: "neck", id: "bow_tie" },
                { slot: "body", id: "butterfly_wings" },
              ]}
              autoRotate={false}
            />
            <Creature3dView speciesId="difficile-ondine-rieuse" stage="sage" state="tired" autoRotate={false} />
          </div>
          <div className="flex gap-2">
            <Species3dButton speciesId="facile-chat-rond" />
            <Species3dButton speciesId="facile-chat-rond" compact />
          </div>
        </div>
      );
      break;
    case "ar":
      content = (
        <div className="space-y-4">
          <ArViewer
            targets={[
              { markerId: 17, mine: true, ownerName: null, creature: { name: "Miso", speciesId: "facile-panda-roux", stage: "enfant", state: "healthy", accessories: [{ slot: "head", id: "beret" }, { slot: "eyes", id: "round_glasses" }] } },
              {
                markerId: 42,
                mine: false,
                ownerName: "Léa",
                creature: {
                  name: "Pipo",
                  speciesId: "facile-cochon-dinde",
                  stage: "adulte",
                  state: "healthy",
                  accessories: [
                    { slot: "head", id: "nightcap" },
                    { slot: "neck", id: "bow_tie" },
                    { slot: "body", id: "butterfly_wings" },
                  ],
                },
              },
            ]}
          />
          <div className="flex justify-center gap-4">
            <div id="dev-marker-17" className="w-40 bg-white p-1" dangerouslySetInnerHTML={{ __html: markerSvg(17) }} />
            <div id="dev-marker-42" className="w-40 bg-white p-1" dangerouslySetInnerHTML={{ __html: markerSvg(42) }} />
          </div>
        </div>
      );
      break;
    case "admin-players":
      content = (
        <div className="space-y-4">
          <PlayerCard
            player={{
              userId: "u1",
              username: "Chabond",
              friendCode: "MM-7K2P9Q",
              email: "chabond@example.com",
              createdAt: "2026-08-20T10:00:00.000Z",
              creatureIsCurrent: true,
              counts: { meals: 42, steps: 128_400, friends: 3, deadCreatures: 1 },
              awayAt: null,
              hosting: 1,
              creature: {
                id: "11111111-1111-4111-8111-111111111111",
                status: "alive",
                tier: "facile",
                tierLabel: "Facile",
                name: "Miso",
                speciesId: "facile-chat-rond",
                speciesName: "Chabond",
                tagline: "Un chat tout rond qui ronronne dès qu'on le regarde.",
                rarity: "commun",
                rarityLabel: "Commun",
                stage: "enfant",
                stageLabel: "Enfant",
                state: "healthy",
                health: 88,
                hunger: 35,
                mood: 72,
                moodLabel: "Ravie (XP +25 %)",
                xp: 210,
                xpToNextStage: 290,
                eggSteps: 15000,
                hatchSteps: 15000,
                ageDays: 12,
                createdAt: "2026-08-20T10:00:00.000Z",
                hatchedAt: "2026-08-24T10:00:00.000Z",
                sickSince: null,
                daysUntilDeath: null,
                protectedUntil: null,
                diedAt: null,
                deathCause: null,
                lifespanDays: null,
                accessoryDrops: 3,
                chestBonusSteps: 1_240,
                accessories: ["Béret", "Nœud papillon"],
                arMarker: 17,
              },
            }}
          />
          <PlayerCard
            player={{
              userId: "u2",
              username: "Léa",
              friendCode: "MM-3XZ8AB",
              email: "lea@example.com",
              createdAt: "2026-09-10T10:00:00.000Z",
              creatureIsCurrent: true,
              counts: { meals: 2, steps: 4_200, friends: 1, deadCreatures: 0 },
              awayAt: null,
              hosting: 0,
              creature: {
                id: "22222222-2222-4222-8222-222222222222",
                status: "egg",
                tier: "moyen",
                tierLabel: "Moyen",
                name: null,
                speciesId: null,
                speciesName: null,
                tagline: null,
                rarity: null,
                rarityLabel: null,
                stage: "bebe",
                stageLabel: "Bébé",
                state: "healthy",
                health: 100,
                hunger: 0,
                mood: 100,
                moodLabel: "",
                xp: 0,
                xpToNextStage: 150,
                eggSteps: 4200,
                hatchSteps: 30000,
                ageDays: 0,
                createdAt: "2026-09-10T10:00:00.000Z",
                hatchedAt: null,
                sickSince: null,
                daysUntilDeath: null,
                protectedUntil: null,
                diedAt: null,
                deathCause: null,
                lifespanDays: null,
                accessoryDrops: 0,
                chestBonusSteps: 0,
                accessories: [],
                arMarker: null,
              },
            }}
          />
        </div>
      );
      break;
    case "turnaround": {
      const bodies = ["round", "tall", "blob", "egg", "serpent"] as const;
      content = (
        <div className="space-y-4">
          <h1 className="font-display text-2xl text-cream-50">Tour d&apos;horizon : 8 vues par silhouette</h1>
          <p className="text-sm text-cream-500">Vue 0 = face caméra, puis 45° dans le sens horaire vu de dessus (le visage glisse vers la gauche).</p>
          {bodies.map((body, row) => {
            const species = ALL_SPECIES.find((s) => s.parts.body === body && s.parts.tail !== "none" && s.parts.ears !== "none") ?? ALL_SPECIES.find((s) => s.parts.body === body)!;
            const accessories = row === 0 ? [{ slot: "head" as const, id: "beret" }, { slot: "eyes" as const, id: "round_glasses" }] : row === 1 ? [{ slot: "body" as const, id: "backpack" }, { slot: "neck" as const, id: "bow_tie" }] : [];
            return (
              <section key={body} className="rounded-2xl border border-ink-600/80 bg-ink-800/90 p-3">
                <h2 className="text-sm font-semibold text-cream-100">
                  {species.name} <span className="font-normal text-cream-700">({body})</span>
                </h2>
                <div className="mt-2 grid grid-cols-4 gap-1 sm:grid-cols-8" id={`turn-${body}`}>
                  {Array.from({ length: VIEW_COUNT }, (_, view) => (
                    <div key={view} className="flex flex-col items-center">
                      <Creature species={species} stage="adulte" state="healthy" accessories={accessories} size={84} animated={false} yaw={yawForView(view)} />
                      <span className="text-[10px] text-cream-700">{yawForView(view)}°</span>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      );
      break;
    }
    case "schema":
      content = <SchemaOutdatedScreen missing={MIGRATIONS.slice(-2)} />;
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
          boarding={{ id: "66666666-6666-4666-8666-666666666666", creatureId: "demo", startedAt: new Date().toISOString(), endsAt, daysLeft: 9, days: 14, status: "active", seen: true }}
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
          <BoardingProposals
            proposals={[{ boarding: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", creatureId: "demo-lune", status: "pending", startedAt: new Date().toISOString(), endsAt, daysLeft: 5, days: 14, seen: false }, creature: mockCreature({ id: "demo-lune", name: "Lune", tier: "facile", species: toSpeciesSummary(getSpecies("facile-lapin-doux")!) }), ownerName: "Lina" }]}
          />
          <CreatureHome creature={mockCreature({})} line={creatureLine(mockCreature({}))} chestsAvailable={1} />
          <HostedCreatures
            items={[
              { boarding: { id: "77777777-7777-4777-8777-777777777777", creatureId: azur.id, startedAt: new Date().toISOString(), endsAt, daysLeft: 5, days: 7, status: "active", seen: false }, creature: azur, accessories: [], owner: { userId: "u2", username: "Karim" } },
              { boarding: { id: "88888888-8888-4888-8888-888888888888", creatureId: roux.id, startedAt: new Date().toISOString(), endsAt, daysLeft: 12, days: 14, status: "active", seen: true }, creature: roux, accessories: [{ slot: "head", id: "beret" }], owner: { userId: "u1", username: "Marion" } },
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
          boarding={{ id: "77777777-7777-4777-8777-777777777777", creatureId: azur.id, startedAt: new Date().toISOString(), endsAt, daysLeft: 5, days: 7, status: "active", seen: true }}
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
    case "home-pending": {
      const endsAt = new Date(Date.now() + 7 * 86_400_000).toISOString();
      const c = mockCreature({});
      content = (
        <div className="space-y-4">
          <OwnerBoardingNotices
            proposal={{ boarding: { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", creatureId: "demo", status: "pending", startedAt: new Date().toISOString(), endsAt, daysLeft: 7, days: 7, seen: false }, host: "Karim", creatureName: "Miso" }}
            notices={[{ boarding: { id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", creatureId: "demo", status: "ended", startedAt: new Date().toISOString(), endsAt, daysLeft: 0, days: 3, seen: true }, host: { userId: "u1", username: "Marion" }, creatureName: "Miso", kind: "declined" }]}
          />
          <CreatureHome creature={c} line={creatureLine(c)} />
        </div>
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
