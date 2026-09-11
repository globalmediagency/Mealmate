"use client";

import { Heart, Smile, Tent, Utensils } from "lucide-react";
import { Creature, type EquippedAccessory } from "@/components/creatures/creature";
import { Environment } from "@/components/creatures/environment";
import { RarityBadge } from "@/components/creatures/rarity-badge";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import type { BoardingView } from "@/lib/boarding/service";
import { getSpecies } from "@/lib/creatures";
import type { PublicProfile } from "@/lib/friends/service";
import type { CreatureView } from "@/lib/game/creature-view";
import { ageLabel, hungerLabel } from "@/lib/game/dialogue";
import { EndBoardingButton } from "./boarding-actions";
import { Gauge } from "./gauge";

export const formatEndDate = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });

/** The owner's home screen while their creature lives at a friend's. */
export function BoardedAway({ creature, accessories, boarding, host }: { creature: CreatureView; accessories: EquippedAccessory[]; boarding: BoardingView; host: PublicProfile }) {
  const species = creature.species ? getSpecies(creature.species.id) : undefined;
  if (!species) return null;
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

      <Alert tone="info" title={`En pension chez ${host.username}`}>
        Jusqu&apos;au {formatEndDate(boarding.endsAt)} ({boarding.daysLeft} jour{boarding.daysLeft > 1 ? "s" : ""} restant{boarding.daysLeft > 1 ? "s" : ""}). {host.username} la nourrit, joue avec elle et
        peut la soigner ; les coffres qu&apos;elle gagne là-bas sont pour {host.username}. Elle rentrera toute seule à la fin du séjour.
      </Alert>
      {creature.state === "sick" ? (
        <Alert tone="danger" title="Elle est malade">
          {host.username} peut la soigner avec son armoire à pharmacie. Si tu préfères t&apos;en occuper toi-même, récupère-la maintenant.
        </Alert>
      ) : null}

      <section className="relative overflow-hidden rounded-3xl border border-ink-600/80 shadow-card" style={{ height: "min(48vh, 400px)" }}>
        <div className="absolute inset-0">
          <Environment tier={creature.tier} />
        </div>
        <div className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full border border-cream-100/10 bg-ink-900/80 px-3 py-1.5 text-xs font-semibold text-cream-100 backdrop-blur">
          <Tent className="h-4 w-4 text-sage-300" aria-hidden="true" />
          Chez {host.username}
        </div>
        <div className="absolute inset-x-0 bottom-2 flex justify-center opacity-90">
          <Creature species={species} stage={creature.stage.id} state={creature.state} size={220} accessories={accessories} />
        </div>
      </section>

      <section className="space-y-3 rounded-3xl border border-ink-600/80 bg-ink-800/90 p-4 shadow-card">
        <Gauge icon={Heart} label="Santé" value={creature.health} barClass="bg-health" />
        <Gauge icon={Utensils} label="Faim" value={creature.hunger} barClass="bg-hunger" caption={hungerLabel(creature.hunger)} />
        <Gauge icon={Smile} label="Humeur" value={creature.mood} barClass="bg-mood" />
        <p className="pt-1 text-xs text-cream-700">{creature.xp} XP · ses stats sont à jour, où qu&apos;elle soit</p>
      </section>

      <EndBoardingButton boardingId={boarding.id} label={`Récupérer ma créature en pension chez ${host.username}`} />
      <LinkButton href="/friends" variant="ghost">
        Voir mes amis
      </LinkButton>
    </div>
  );
}
