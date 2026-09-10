"use client";

import { Camera, Footprints, Gamepad2, Heart, HeartPulse, Shirt, Smile, Utensils } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Creature, type Reaction } from "@/components/creatures/creature";
import { Environment } from "@/components/creatures/environment";
import { RarityBadge } from "@/components/creatures/rarity-badge";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { getSpecies } from "@/lib/creatures";
import type { CreatureView } from "@/lib/game/creature-view";
import { ageLabel, creatureLine, hungerLabel } from "@/lib/game/dialogue";
import { cn } from "@/lib/utils/cn";
import { Gauge } from "./gauge";

type CreatureHomeProps = { creature: CreatureView; line: string };

type Action = { id: string; label: string; icon: typeof Camera; href?: string; highlight?: boolean };

export function CreatureHome({ creature, line }: CreatureHomeProps) {
  const species = creature.species ? getSpecies(creature.species.id) : undefined;
  const [reaction, setReaction] = useState<Reaction | null>(null);
  const [bubble, setBubble] = useState(line);
  const [toast, setToast] = useState<string | null>(null);
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

  function soon(label: string) {
    setToast(`${label} : bientôt disponible.`);
    window.setTimeout(() => setToast(null), 2000);
  }

  if (!species) return null;

  const actions: Action[] = [
    { id: "feed", label: "Nourrir", icon: Camera, href: "/feed", highlight: creature.hunger >= 60 && creature.state !== "sick" },
    { id: "play", label: "Jouer", icon: Gamepad2 },
    { id: "walk", label: "Marcher", icon: Footprints, href: "/activity" },
    { id: "dress", label: "Habiller", icon: Shirt },
    { id: "heal", label: "Soigner", icon: HeartPulse, highlight: creature.state === "sick" },
  ];

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
        </div>
      </header>

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
          <Creature species={species} stage={creature.stage.id} state={creature.state} size={260} reaction={reaction} />
        </button>
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
        {actions.map(({ id, label, icon: Icon, href, highlight }) => {
          const classes = cn(
            buttonClasses(highlight ? "brass" : "secondary", "md"),
            "min-h-14 flex-col gap-1 text-xs",
            !href && !highlight && "opacity-80",
          );
          return href ? (
            <Link key={id} href={href} className={classes}>
              <Icon className="h-5 w-5" aria-hidden="true" />
              {label}
            </Link>
          ) : (
            <button key={id} type="button" className={classes} onClick={() => soon(label)}>
              <Icon className="h-5 w-5" aria-hidden="true" />
              {label}
            </button>
          );
        })}
      </nav>

      {toast ? (
        <div role="status" className="fixed inset-x-4 bottom-24 z-50 mx-auto max-w-sm rounded-2xl border border-ink-500 bg-ink-800/95 px-4 py-3 text-center text-sm text-cream-100 shadow-card backdrop-blur animate-rise">
          {toast}
        </div>
      ) : null}
    </div>
  );
}
