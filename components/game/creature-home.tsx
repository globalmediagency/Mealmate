"use client";

import { Camera, ChevronDown, ChevronRight, Footprints, Gamepad2, Gift, Heart, HeartPulse, ScanLine, Shield, Shirt, Smile, Utensils } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useLiveArena } from "@/components/arena/live-arena";
import { type EquippedAccessory, type Reaction } from "@/components/creatures/creature";
import { Environment } from "@/components/creatures/environment";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { getSpecies } from "@/lib/creatures";
import { RARITY_LABELS } from "@/lib/game/config";
import type { CreatureView } from "@/lib/game/creature-view";
import { ageLabel, careAction, creatureLine, hungerLabel, moodHelp, moodLabel } from "@/lib/game/dialogue";
import { SHOP_ITEM_IDS } from "@/lib/game/medicine";
import type { GiftView, Inventory } from "@/lib/shop/service";
import type { TossEvent } from "@/lib/game/toss";
import { cn } from "@/lib/utils/cn";
import { CareAlert } from "./care-alert";
import { ChestOpener } from "./chest-reveal";
import { Gauge } from "./gauge";
import { GiftsNotice } from "./gifts-notice";
import { HealPanel } from "./heal-panel";
import { ThrowableCreature } from "./throwable-creature";

export type HomeChest = { available: number; stepsToNext: number; stepsPerChest: number; opened: number; earned: number; totalSteps: number };

type CreatureHomeProps = {
  creature: CreatureView;
  line: string;
  accessories?: EquippedAccessory[];
  /** Chests ready to open and the distance to the next one. */
  chest?: HomeChest | null;
  /** Steps entered today (all sources), for the "Aujourd'hui" line; null = unknown. */
  todaySteps?: number | null;
  /** The player's medicine cupboard: "Soigner" opens it in place. */
  inventory?: Inventory;
  /** Medicine or accessories received from friends and not acknowledged yet. */
  gifts?: GiftView[];
  /** Plays left today for this creature (every game counts) and the daily maximum; null = unknown. */
  playsLeft?: number | null;
  /** Meals photographed today and the daily maximum; null = unknown. */
  mealsToday?: number | null;
  maxMeals?: number;
};

const DAY_MS = 86_400_000;
const EMPTY_INVENTORY: Inventory = { sirop: 0, antibiotique: 0, talisman: 0 };

/**
 * The creature screen (spec § 3.5): what the player does every day, above the
 * fold. Scene, then a fixed row of doors — Nourrir · Jouer · Habiller, plus
 * Soigner when a dose or an illness makes it useful — then the day's steps and
 * chests, then the compact gauges. The games live behind "Jouer" (the hub).
 */
export function CreatureHome({ creature, line, accessories = [], chest = null, todaySteps = null, inventory = EMPTY_INVENTORY, gifts = [], playsLeft = null, mealsToday = null, maxMeals }: CreatureHomeProps) {
  const species = creature.species ? getSpecies(creature.species.id) : undefined;
  const live = useLiveArena();
  const [reaction, setReaction] = useState<Reaction | null>(null);
  const [bubble, setBubble] = useState(line);
  const [healOpen, setHealOpen] = useState(false);
  const [chestOpen, setChestOpen] = useState(false);
  const [moodOpen, setMoodOpen] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);

  /** One line in the bubble, then back to the creature's own line. */
  function say(text: string, ms = 1600) {
    if (timer.current) window.clearTimeout(timer.current);
    setBubble(text);
    timer.current = window.setTimeout(() => {
      setReaction(null);
      setBubble(creatureLine(creature));
    }, ms);
  }

  function tap() {
    if (reaction) return;
    setReaction("tap");
    say(creature.state === "sick" ? "Doucement…" : "Hihi !", 1300);
  }

  /** What the creature says while it is thrown, loses its things and fetches them back (`ThrowableCreature`). */
  function onToss(event: TossEvent) {
    switch (event.kind) {
      case "throw":
        say(creature.state === "sick" ? "Ouh… pas si fort…" : "Wouuuh !");
        break;
      case "drop":
        say("Hé ! Mes affaires !");
        break;
      case "land":
        if (event.thrown) say(event.loose > 0 ? "Bon… je ramasse tout ça." : "Encore !");
        break;
      case "home":
        if (event.collected > 0) say("Et voilà, tout est remis en place.");
        break;
      default:
        break;
    }
  }

  if (!species) return null;

  const doses = SHOP_ITEM_IDS.reduce((sum, id) => sum + inventory[id], 0);
  const care = careAction(creature, doses);
  const showHeal = creature.state !== "healthy" || doses > 0;
  const unseenAccessories = gifts.filter((g) => g.kind === "accessory").length;
  const protectedDays = creature.protectedUntil ? Math.ceil((new Date(creature.protectedUntil).getTime() - Date.now()) / DAY_MS) : 0;
  const mealsLeft = mealsToday !== null && maxMeals !== undefined ? Math.max(0, maxMeals - mealsToday) : null;
  const chestsAvailable = chest?.available ?? 0;
  const subtitle = [species.name, creature.rarity ? RARITY_LABELS[creature.rarity] : null, creature.stage.label, ageLabel(creature.ageDays)].filter(Boolean).join(" · ");
  const tile = (highlight: boolean) => cn(buttonClasses(highlight ? "brass" : "secondary", "md"), "relative min-h-14 flex-col gap-0.5 px-1 text-xs leading-tight");

  return (
    <div className="space-y-3 animate-rise" data-creature-home>
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate font-display text-3xl font-semibold tracking-tight text-cream-50">{creature.name}</h1>
          <p className="mt-0.5 truncate text-sm text-cream-500">{subtitle}</p>
        </div>
        {protectedDays > 0 ? (
          <Badge className="shrink-0 border-brass-400/60 bg-brass-500/15 text-brass-200" title="Talisman actif : pas de risque de mort">
            <Shield className="h-3.5 w-3.5" aria-hidden="true" />
            Protégée {protectedDays} j
          </Badge>
        ) : null}
      </header>

      {gifts.length > 0 && creature.name ? <GiftsNotice gifts={gifts} creatureName={creature.name} /> : null}
      <CareAlert creature={creature} doses={doses} onHeal={() => setHealOpen(true)} />

      <section className="relative overflow-hidden rounded-3xl border border-ink-600/80 shadow-card" style={{ height: "min(44vh, 360px)" }}>
        <div className="absolute inset-0">
          <Environment tier={creature.tier} />
        </div>
        <div className="absolute left-3 right-32 top-3 flex justify-start">
          <p
            key={bubble}
            className="max-w-full rounded-2xl rounded-bl-sm border border-cream-100/10 bg-ink-900/80 px-3.5 py-2 text-sm text-cream-100 backdrop-blur animate-rise"
            aria-live="polite"
          >
            {bubble}
          </p>
        </div>
        <Link
          href="/ar"
          className="absolute right-3 top-3 inline-flex min-h-11 items-center gap-1.5 rounded-full border border-cream-100/15 bg-ink-900/80 px-3.5 text-xs font-semibold text-cream-100 backdrop-blur hover:border-sage-400/60 hover:text-sage-200"
          data-home-ar
        >
          <ScanLine className="h-4 w-4 text-sage-300" aria-hidden="true" />
          Voir en vrai
        </Link>
        <ThrowableCreature
          species={species}
          stage={creature.stage.id}
          state={creature.state}
          accessories={accessories}
          size={220}
          reaction={reaction}
          label={`Caresser ${creature.name}`}
          throwable={creature.state !== "dead"}
          onTap={tap}
          onToss={onToss}
        />
      </section>

      <nav aria-label="Actions" className={cn("grid gap-2", showHeal ? "grid-cols-4" : "grid-cols-3")} data-home-actions={showHeal ? 4 : 3}>
        <Link href="/feed" className={tile(care === "feed")} data-home-action="feed">
          <Camera className="h-5 w-5" aria-hidden="true" />
          Nourrir
          {mealsLeft !== null ? <span className={cn("text-xs font-medium", care === "feed" ? "text-ink-900/80" : "text-cream-500")}>{mealsLeft > 0 ? `${mealsLeft} repas` : "à demain"}</span> : null}
        </Link>
        <Link href="/play" className={tile(care === null && playsLeft !== null && playsLeft > 0)} data-home-action="play">
          <Gamepad2 className="h-5 w-5" aria-hidden="true" />
          Jouer
          {playsLeft !== null ? <span className={cn("text-xs font-medium", care === null && playsLeft > 0 ? "text-ink-900/80" : "text-cream-500")}>{playsLeft > 0 ? `${playsLeft} partie${playsLeft > 1 ? "s" : ""}` : "à demain"}</span> : null}
          {live.invites > 0 ? (
            <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-brass-400 px-1 text-[11px] font-bold text-ink-950" data-home-invites={live.invites}>
              {live.invites}
              <span className="sr-only"> invitation{live.invites > 1 ? "s" : ""} à jouer</span>
            </span>
          ) : null}
        </Link>
        <Link href="/wardrobe" className={tile(false)} data-home-action="dress">
          <Shirt className="h-5 w-5" aria-hidden="true" />
          Habiller
          {unseenAccessories > 0 ? (
            <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-brass-400 px-1 text-[11px] font-bold text-ink-950">
              {unseenAccessories}
              <span className="sr-only"> accessoire{unseenAccessories > 1 ? "s" : ""} reçu{unseenAccessories > 1 ? "s" : ""}</span>
            </span>
          ) : null}
        </Link>
        {showHeal ? (
          <button
            type="button"
            onClick={() => setHealOpen((v) => !v)}
            aria-expanded={healOpen}
            aria-controls={healOpen ? "soigner" : undefined}
            className={tile(care === "heal")}
            data-home-action="heal"
          >
            <HeartPulse className="h-5 w-5" aria-hidden="true" />
            {doses > 0 ? `Soigner (${doses})` : "Soigner"}
          </button>
        ) : null}
      </nav>

      {healOpen ? <HealPanel creatureName={creature.name ?? "ta créature"} inventory={inventory} onClose={() => setHealOpen(false)} /> : null}

      {chestsAvailable > 0 ? (
        <button
          type="button"
          onClick={() => setChestOpen((v) => !v)}
          aria-expanded={chestOpen}
          className="flex min-h-11 w-full items-center gap-3 rounded-2xl border border-brass-400/60 bg-brass-500/10 px-4 text-left text-sm text-brass-100"
          data-home-today="chest"
        >
          <Gift className="h-5 w-5 shrink-0 text-brass-300 animate-pulse-soft" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <strong>
              {chestsAvailable} coffre{chestsAvailable > 1 ? "s" : ""} à ouvrir
            </strong>
            {todaySteps !== null ? <span className="text-brass-200/80"> · {todaySteps.toLocaleString("fr-FR")} pas aujourd&apos;hui</span> : null}
          </span>
          <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", chestOpen && "rotate-180")} aria-hidden="true" />
        </button>
      ) : (
        <Link href="/activity" className="flex min-h-11 items-center gap-3 rounded-2xl border border-ink-600/80 bg-ink-800/70 px-4 text-sm text-cream-300 hover:border-ink-500" data-home-today="steps">
          <Footprints className="h-5 w-5 shrink-0 text-sage-300" aria-hidden="true" />
          <span className="min-w-0 flex-1 py-1.5">
            {todaySteps === null ? (
              "Tes pas du jour"
            ) : todaySteps === 0 ? (
              <>
                <span className="block">Aucun pas saisi aujourd&apos;hui</span>
                <span className="block text-xs text-cream-500">Ajoute-les : chaque 1 000 pas renforce {creature.name}</span>
              </>
            ) : (
              <>
                <span className="block">
                  Aujourd&apos;hui : <strong className="text-cream-50">{todaySteps.toLocaleString("fr-FR")} pas</strong>
                </span>
                {chest ? <span className="block text-xs text-cream-500">Prochain coffre dans {chest.stepsToNext.toLocaleString("fr-FR")} pas</span> : null}
              </>
            )}
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-cream-700" aria-hidden="true" />
        </Link>
      )}
      {chestOpen && chest ? <ChestOpener status={chest} canEquip={Boolean(creature.name)} /> : null}

      <section className="space-y-1 rounded-3xl border border-ink-600/80 bg-ink-800/90 px-4 py-3 shadow-card" data-home-stats>
        <Gauge compact icon={Heart} label="Santé" value={creature.health} barClass="bg-health" />
        <Gauge compact icon={Utensils} label="Faim" value={creature.hunger} barClass="bg-hunger" caption={hungerLabel(creature.hunger)} />
        <Gauge compact icon={Smile} label="Humeur" value={creature.mood} barClass="bg-mood" caption={moodLabel(creature.moodBand, creature.moodEffects)} />
        <div className="flex items-center justify-between gap-2 pt-1 text-xs text-cream-500">
          <span className="min-w-0 truncate">
            {creature.xp} XP
            {creature.xpToNextStage !== null ? ` · encore ${creature.xpToNextStage} avant le stade suivant` : " · stade maximal"}
          </span>
          <button
            type="button"
            onClick={() => setMoodOpen((v) => !v)}
            aria-expanded={moodOpen}
            className="-my-2 -mr-2 flex min-h-11 shrink-0 items-center gap-1 rounded-xl px-2 text-xs font-semibold text-cream-300 hover:text-cream-50"
          >
            Humeur ?
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", moodOpen && "rotate-180")} aria-hidden="true" />
          </button>
        </div>
        {moodOpen ? <p className="text-xs leading-snug text-cream-500 animate-rise">{moodHelp(creature.moodEffects)}</p> : null}
      </section>
    </div>
  );
}
