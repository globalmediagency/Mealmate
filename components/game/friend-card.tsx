import { Egg, Flower2, HeartPulse, UserRound } from "lucide-react";
import { Creature } from "@/components/creatures/creature";
import { Egg as EggSvg } from "@/components/creatures/egg";
import { RarityBadge } from "@/components/creatures/rarity-badge";
import { getSpecies } from "@/lib/creatures";
import type { FriendView } from "@/lib/friends/service";
import { STAGES, TIER_CONFIG } from "@/lib/game/config";
import type { CreatureState } from "@/lib/game/creature-view";
import { ageLabel } from "@/lib/game/dialogue";
import { crackLevel } from "@/lib/game/steps";
import { cn } from "@/lib/utils/cn";

const STATE_LABELS: Record<CreatureState, { label: string; className: string }> = {
  healthy: { label: "En forme", className: "border-health/50 bg-health/15 text-health" },
  tired: { label: "Fatiguée", className: "border-brass-400/50 bg-brass-500/15 text-brass-300" },
  sick: { label: "Malade", className: "border-danger/50 bg-danger/15 text-danger" },
  dead: { label: "Au cimetière", className: "border-cream-500/40 bg-cream-500/10 text-cream-300" },
};

/** One friend with what they allow us to see of their creature (spec § 3.11). */
export function FriendCard({ friend, children }: { friend: FriendView; children?: React.ReactNode }) {
  const { creature } = friend;
  return (
    <li className="flex gap-3 rounded-3xl border border-ink-600/80 bg-ink-800/90 p-3 shadow-card">
      <div className="flex h-28 w-28 shrink-0 items-center justify-center rounded-2xl bg-ink-900/70">
        <FriendCreatureVisual creature={creature} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-semibold text-cream-50">{friend.user.username}</p>
            <p className="truncate text-xs text-cream-500">
              {creature.status === "alive"
                ? `${creature.name ?? "Sans nom"} · ${creature.species?.name ?? "?"}`
                : creature.status === "egg"
                  ? `Œuf ${TIER_CONFIG[creature.tier].label.toLowerCase()} en incubation`
                  : creature.status === "dead"
                    ? `${creature.name ?? "Sa créature"} · ${creature.species?.name ?? "?"}`
                    : "Pas encore de créature"}
            </p>
          </div>
          {children}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {creature.status === "alive" ? (
            <>
              <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold", STATE_LABELS[creature.state].className)}>
                <HeartPulse className="h-3 w-3" aria-hidden="true" />
                {STATE_LABELS[creature.state].label} · {creature.health} %
              </span>
              <Badge>{ageLabel(creature.ageDays)}</Badge>
              <Badge>{STAGES.find((s) => s.id === creature.stage)?.label ?? creature.stage}</Badge>
              <Badge>{TIER_CONFIG[creature.tier].label}</Badge>
              {creature.rarity ? <RarityBadge rarity={creature.rarity} className="text-[10px]" /> : null}
            </>
          ) : creature.status === "egg" ? (
            <>
              <span className="inline-flex items-center gap-1 rounded-full border border-sage-700/60 bg-sage-800/30 px-2 py-0.5 text-[11px] font-semibold text-sage-200">
                <Egg className="h-3 w-3" aria-hidden="true" />
                {Math.round(creature.hatchProgress * 100)} %
              </span>
              <Badge>{TIER_CONFIG[creature.tier].label}</Badge>
            </>
          ) : creature.status === "dead" ? (
            <>
              <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold", STATE_LABELS.dead.className)}>
                <Flower2 className="h-3 w-3" aria-hidden="true" />
                Au cimetière
              </span>
              {creature.lifespanDays !== null ? <Badge>{creature.lifespanDays} jour{creature.lifespanDays > 1 ? "s" : ""} de vie</Badge> : null}
              {creature.rarity ? <RarityBadge rarity={creature.rarity} className="text-[10px]" /> : null}
            </>
          ) : (
            <Badge>
              <UserRound className="mr-1 inline h-3 w-3" aria-hidden="true" />
              Choisit son œuf
            </Badge>
          )}
        </div>
      </div>
    </li>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex items-center rounded-full border border-ink-500 bg-ink-700 px-2 py-0.5 text-[11px] text-cream-300">{children}</span>;
}

function FriendCreatureVisual({ creature }: { creature: FriendView["creature"] }) {
  if (creature.status === "egg") return <EggSvg tier={creature.tier} crack={crackLevel(creature.hatchProgress)} size={84} />;
  if (creature.status === "none") return <UserRound className="h-8 w-8 text-cream-700" aria-hidden="true" />;
  const species = creature.species ? getSpecies(creature.species.id) : undefined;
  if (!species) return <UserRound className="h-8 w-8 text-cream-700" aria-hidden="true" />;
  if (creature.status === "dead") return <Creature species={species} stage="adulte" state="dead" size={100} />;
  return <Creature species={species} stage={creature.stage} state={creature.state} size={104} accessories={creature.accessories} />;
}
