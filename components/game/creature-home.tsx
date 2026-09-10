"use client";

import { Camera, Footprints, Gamepad2, Gift, Heart, HeartPulse, Shield, Shirt, Smile, Utensils } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Creature, type EquippedAccessory, type Reaction } from "@/components/creatures/creature";
import { Environment } from "@/components/creatures/environment";
import { RarityBadge } from "@/components/creatures/rarity-badge";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { getSpecies } from "@/lib/creatures";
import type { CreatureView } from "@/lib/game/creature-view";
import { ageLabel, creatureLine, hungerLabel } from "@/lib/game/dialogue";
import type { GiftView } from "@/lib/shop/service";
import { cn } from "@/lib/utils/cn";
import { CareAlert } from "./care-alert";
import { Gauge } from "./gauge";
import { GiftsNotice } from "./gifts-notice";

type CreatureHomeProps = {
  creature: CreatureView;
  line: string;
  accessories?: EquippedAccessory[];
  chestsAvailable?: number;
  /** Medicine doses in the user's inventory (shown on the "Soigner" action). */
  doses?: number;
  /** Medicine received from friends and not acknowledged yet. */
  gifts?: GiftView[];
};

type Action = { id: string; label: string; icon: typeof Camera; href: string; highlight?: boolean };

const DAY_MS = 86_400_000;

export function CreatureHome({ creature, line, accessories = [], chestsAvailable = 0, doses = 0, gifts = [] }: CreatureHomeProps) {
  const species = creature.species ? getSpecies(creature.species.id) : undefined;
  const [reaction, setReaction] = useState<Reaction | null>(null);
  const [bubble, setBubble] = useState(line);
  const timer = useRef<number | null>(null);

  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);

  function tap() {
    if (reaction) return;
    setReaction("tap");
    setBubble(creature.state === "sick" ? "Doucement…" : "Hihi !");
    timer.current = window.setTimeout(() => {
      setReaction(null);
      setBubble(creatureLine(creature));
    }, 1300);
  }

  if (!species) return null;

  const actions: Action[] = [
    { id: "feed", label: "Nourrir", icon: Camera, href: "/feed", highlight: creature.hunger >= 60 && creature.state !== "sick" },
    { id: "play", label: "Jouer", icon: Gamepad2, href: "/play" },
    { id: "walk", label: "Marcher", icon: Footprints, href: "/activity" },
    { id: "dress", label: "Habiller", icon: Shirt, href: "/wardrobe" },
    { id: "heal", label: doses > 0 ? `Soigner (${doses})` : "Soigner", icon: HeartPulse, href: "/shop", highlight: creature.state === "sick" || (creature.state === "tired" && doses > 0) },
  ];
  const protectedDays = creature.protectedUntil ? Math.ceil((new Date(creature.protectedUntil).getTime() - Date.now()) / DAY_MS) : 0;

  return (
    <div className="space-y-4 animate-rise">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate font-display text-3xl font-semibold tracking-tight text-cream-50">{creature.name}</h1>
          <p className="mt-0.5 text-sm text-cream-500">
            {species.name} · {ageLabel(creature.ageDays)}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {creature.rarity ? <RarityBadge rarity={creature.rarity} /> : null}
          <Badge>{creature.stage.label}</Badge>
          {protectedDays > 0 ? (
            <Badge className="border-brass-400/60 bg-brass-500/15 text-brass-200" title="Talisman actif : pas de risque de mort">
              <Shield className="h-3.5 w-3.5" aria-hidden="true" />
              Protégée {protectedDays} j
            </Badge>
          ) : null}
        </div>
      </header>

      {gifts.length > 0 && creature.name ? <GiftsNotice gifts={gifts} creatureName={creature.name} /> : null}
      <CareAlert creature={creature} doses={doses} />

      <section
        className="relative overflow-hidden rounded-3xl border border-ink-600/80 shadow-card"
        style={{ height: "min(56vh, 460px)" }}
      >
        <div className="absolute inset-0">
          <Environment tier={creature.tier} />
        </div>
        <div className="absolute inset-x-4 top-4 flex justify-center">
          <p
            key={bubble}
            className="max-w-[85%] rounded-2xl rounded-bl-sm border border-cream-100/10 bg-ink-900/80 px-4 py-2 text-center text-sm text-cream-100 backdrop-blur animate-rise"
            aria-live="polite"
          >
            {bubble}
          </p>
        </div>
        <button
          type="button"
          onClick={tap}
          aria-label={`Caresser ${creature.name}`}
          className="absolute inset-x-0 bottom-2 flex justify-center focus-visible:outline-none"
        >
          <Creature species={species} stage={creature.stage.id} state={creature.state} size={260} reaction={reaction} accessories={accessories} />
        </button>
        {chestsAvailable > 0 ? (
          <Link
            href="/activity"
            className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-full border border-brass-400/60 bg-ink-900/85 px-3 py-1.5 text-xs font-semibold text-brass-200 backdrop-blur animate-pulse-soft"
          >
            <Gift className="h-4 w-4" aria-hidden="true" />
            {chestsAvailable} coffre{chestsAvailable > 1 ? "s" : ""}
          </Link>
        ) : null}
      </section>

      <section className="space-y-3 rounded-3xl border border-ink-600/80 bg-ink-800/90 p-4 shadow-card">
        <Gauge icon={Heart} label="Santé" value={creature.health} barClass="bg-health" />
        <Gauge icon={Utensils} label="Faim" value={creature.hunger} barClass="bg-hunger" caption={hungerLabel(creature.hunger)} />
        <Gauge icon={Smile} label="Humeur" value={creature.mood} barClass="bg-mood" />
        <p className="pt-1 text-xs text-cream-700">
          {creature.xp} XP
          {creature.xpToNextStage !== null ? ` · encore ${creature.xpToNextStage} XP avant le stade suivant` : " · stade maximal atteint"}
        </p>
      </section>

      <nav aria-label="Actions" className="grid grid-cols-3 gap-2">
        {actions.map(({ id, label, icon: Icon, href, highlight }) => (
          <Link key={id} href={href} className={cn(buttonClasses(highlight ? "brass" : "secondary", "md"), "min-h-14 flex-col gap-1 text-xs")}>
            <Icon className="h-5 w-5" aria-hidden="true" />
            {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
