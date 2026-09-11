"use client";

import { Egg, Flower2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Creature } from "@/components/creatures/creature";
import { RarityBadge } from "@/components/creatures/rarity-badge";
import { Alert } from "@/components/ui/alert";
import { Button, LinkButton } from "@/components/ui/button";
import { getSpecies } from "@/lib/creatures";
import { TIER_CONFIG } from "@/lib/game/config";
import type { CreatureView } from "@/lib/game/creature-view";

type MourningProps = {
  creature: CreatureView;
  /** Username of the friend the creature was staying with when it died. */
  boardedWith?: string | null;
};

/** Sober farewell screen shown once after a death, before choosing a new egg. */
export function Mourning({ creature, boardedWith = null }: MourningProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const species = creature.species ? getSpecies(creature.species.id) : undefined;
  const days = creature.lifespanDays ?? creature.ageDays;
  const diedOn = creature.diedAt
    ? new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", timeZone: "Europe/Paris" }).format(new Date(creature.diedAt))
    : null;

  async function next() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/creatures/mourn", { method: "POST" });
      if (!response.ok) throw new Error();
      router.refresh();
    } catch {
      setError("Impossible de continuer pour le moment. Réessaie.");
      setPending(false);
    }
  }

  return (
    <div className="space-y-6 animate-rise">
      <section className="rounded-3xl border border-ink-600/80 bg-ink-800/90 px-5 pb-6 pt-8 text-center shadow-card">
        {species ? (
          <div className="mx-auto mb-2 flex items-center justify-center" style={{ width: 200, height: 200 }}>
            <Creature species={species} stage={creature.stage.id} state="dead" size={200} />
          </div>
        ) : null}
        <p className="text-xs uppercase tracking-[0.2em] text-cream-500">Au revoir</p>
        <h1 className="mt-1 font-display text-4xl font-semibold text-cream-50">{creature.name}</h1>
        <div className="mt-2 flex items-center justify-center gap-2 text-sm text-cream-500">
          <span>{species?.name}</span>
          {creature.rarity ? <RarityBadge rarity={creature.rarity} /> : null}
        </div>
        <p className="mx-auto mt-5 max-w-xs text-base leading-relaxed text-cream-300">
          {creature.name} a vécu <strong className="text-cream-50">{days} jour{days > 1 ? "s" : ""}</strong> à tes côtés
          {diedOn ? `, jusqu'au ${diedOn}` : ""}. Une longue maladie l&apos;a emporté·e{boardedWith ? `, pendant sa pension chez ${boardedWith}` : ""}.
        </p>
        {boardedWith ? (
          <p className="mx-auto mt-3 max-w-xs text-sm leading-relaxed text-cream-500">
            {boardedWith} a été prévenu·e. La pension est terminée : {creature.name} est revenu·e auprès de toi.
          </p>
        ) : null}
        <p className="mx-auto mt-3 max-w-xs text-sm leading-relaxed text-cream-500">
          Ce n&apos;est pas un échec. Chaque créature apprend quelque chose à celle qui suit. Elle t&apos;attend au
          cimetière, avec les autres.
        </p>
        <p className="mt-4 text-xs text-cream-700">Niveau {TIER_CONFIG[creature.tier].label.toLowerCase()}</p>
      </section>

      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Button onClick={next} disabled={pending}>
        <Egg className="h-5 w-5" aria-hidden="true" />
        {pending ? "Un instant…" : "Choisir un nouvel œuf"}
      </Button>
      <LinkButton href="/cemetery" variant="ghost">
        <Flower2 className="h-5 w-5" aria-hidden="true" />
        Visiter le cimetière
      </LinkButton>
      <p className="text-center text-xs text-cream-700">
        Tu pourras choisir librement le niveau du prochain œuf.{" "}
        <Link href="/privacy" className="underline">
          Tes données restent à toi.
        </Link>
      </p>
    </div>
  );
}
