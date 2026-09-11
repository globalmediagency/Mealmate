"use client";

import { ChevronRight, Tent } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { Creature } from "@/components/creatures/creature";
import { Card, CardTitle } from "@/components/ui/card";
import type { HostedCreatureView } from "@/lib/boarding/views";
import { getSpecies } from "@/lib/creatures";
import { cn } from "@/lib/utils/cn";

/** Home-screen section listing the creatures friends entrusted to the user; opening it acknowledges the new ones. */
export function HostedCreatures({ items }: { items: HostedCreatureView[] }) {
  const unseen = items.some((item) => !item.boarding.seen);
  useEffect(() => {
    if (!unseen) return;
    fetch("/api/boardings/seen", { method: "POST" }).catch(() => {
      // Best effort: the badge simply stays until the next visit.
    });
  }, [unseen]);
  if (items.length === 0) return null;

  return (
    <Card className="animate-rise">
      <CardTitle className="flex items-center gap-2 text-lg">
        <Tent className="h-5 w-5 text-sage-300" aria-hidden="true" />
        En pension chez toi
      </CardTitle>
      <p className="mt-1 text-xs text-cream-500">Tes repas et tes pas comptent aussi pour elles. Touche une créature pour t&apos;en occuper.</p>
      <ul className="mt-3 space-y-2">
        {items.map(({ boarding, creature, accessories, owner }) => {
          const species = creature.species ? getSpecies(creature.species.id) : undefined;
          return (
            <li key={boarding.id}>
              <Link
                href={`/pension/${creature.id}`}
                className={cn("flex min-h-[72px] items-center gap-3 rounded-2xl border bg-ink-900/60 p-2 pr-3 transition-colors hover:border-sage-500/60", boarding.seen ? "border-ink-600/80" : "border-brass-400/60")}
              >
                <span className="flex h-16 w-16 shrink-0 items-end justify-center overflow-hidden rounded-xl bg-ink-800">
                  {species ? <Creature species={species} stage={creature.stage.id} state={creature.state} size={64} accessories={accessories} /> : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate font-semibold text-cream-50">{creature.name}</span>
                    {!boarding.seen ? <span className="rounded-full bg-brass-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-brass-200">Nouveau</span> : null}
                    {creature.state === "sick" ? <span className="rounded-full bg-danger/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-danger">Malade</span> : null}
                  </span>
                  <span className="block text-xs text-cream-500">
                    Confiée par {owner.username} · encore {boarding.daysLeft} jour{boarding.daysLeft > 1 ? "s" : ""}
                  </span>
                  <span className="mt-1.5 flex gap-2" aria-hidden="true">
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-700">
                      <span className="block h-full rounded-full bg-health" style={{ width: `${Math.round(creature.health)}%` }} />
                    </span>
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-700">
                      <span className="block h-full rounded-full bg-hunger" style={{ width: `${Math.round(creature.hunger)}%` }} />
                    </span>
                  </span>
                  <span className="sr-only">
                    Santé {Math.round(creature.health)} sur 100, faim {Math.round(creature.hunger)} sur 100
                  </span>
                </span>
                <ChevronRight className="h-5 w-5 shrink-0 text-cream-700" aria-hidden="true" />
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
