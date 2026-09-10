import type { Metadata } from "next";
import { Flower2 } from "lucide-react";
import { Creature } from "@/components/creatures/creature";
import { RarityBadge } from "@/components/creatures/rarity-badge";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardText } from "@/components/ui/card";
import { requireViewer } from "@/lib/auth/session";
import { getSpecies } from "@/lib/creatures";
import { getDeadCreatures } from "@/lib/creatures/service";
import { TIER_CONFIG, type Rarity, type Tier } from "@/lib/game/config";
import { stageForXp } from "@/lib/game/growth";

export const metadata: Metadata = { title: "Cimetière" };

const dateFormat = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Paris" });

export default async function CemeteryPage() {
  const { session } = await requireViewer();
  const dead = await getDeadCreatures(session.user.id);

  return (
    <div className="space-y-5 animate-rise">
      <PageHeader title="Cimetière" subtitle="Celles et ceux qui ont vécu à tes côtés." />
      {dead.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 py-10 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full border border-ink-500 bg-ink-700 text-cream-500">
            <Flower2 className="h-6 w-6" aria-hidden="true" />
          </span>
          <CardText>Le cimetière est vide, et c&apos;est une bonne nouvelle.</CardText>
        </Card>
      ) : (
        <ul className="grid grid-cols-2 gap-3">
          {dead.map((creature) => {
            const species = creature.speciesId ? getSpecies(creature.speciesId) : undefined;
            const tier = TIER_CONFIG[creature.tier as Tier];
            const days = creature.lifespanDays ?? 0;
            return (
              <li key={creature.id} className="rounded-3xl border border-ink-600/80 bg-ink-800/80 p-3 text-center">
                <div className="mx-auto flex items-center justify-center" style={{ width: 120, height: 120 }}>
                  {species ? <Creature species={species} stage={stageForXp(creature.xp).id} state="dead" size={120} /> : null}
                </div>
                <p className="mt-1 truncate font-display text-lg font-semibold text-cream-50">{creature.name ?? "Sans nom"}</p>
                <p className="text-xs text-cream-500">
                  {species?.name ?? "?"} · {tier.label.toLowerCase()}
                </p>
                {creature.rarity ? (
                  <div className="mt-1.5 flex justify-center">
                    <RarityBadge rarity={creature.rarity as Rarity} className="text-[10px]" />
                  </div>
                ) : null}
                <p className="mt-2 text-xs text-cream-300">
                  {days} jour{days > 1 ? "s" : ""} de vie
                </p>
                {creature.diedAt ? <p className="text-[11px] text-cream-700">{dateFormat.format(creature.diedAt)}</p> : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
