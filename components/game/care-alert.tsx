import { AlertTriangle, HeartPulse, Utensils } from "lucide-react";
import Link from "next/link";
import type { CreatureView } from "@/lib/game/creature-view";
import { cn } from "@/lib/utils/cn";

/** Actionable warning shown on the home screen when the creature needs care. */
export function CareAlert({ creature }: { creature: CreatureView }) {
  if (creature.status !== "alive") return null;
  const name = creature.name ?? "Ta créature";

  if (creature.state === "sick") {
    const left = creature.daysUntilDeath;
    const urgent = left !== null && left <= 1;
    return (
      <Link
        href="/feed"
        className={cn(
          "flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm",
          urgent ? "border-danger/60 bg-danger/15 text-cream-50" : "border-hunger/50 bg-hunger/10 text-cream-100",
        )}
      >
        <HeartPulse className={cn("mt-0.5 h-5 w-5 shrink-0", urgent ? "text-danger" : "text-hunger")} aria-hidden="true" />
        <span>
          <strong>{name} est malade.</strong>{" "}
          {left !== null
            ? left <= 0
              ? "C'est la dernière limite : nourris-la maintenant."
              : `Sans soins, il lui reste environ ${formatDays(left)}. Des repas sains font remonter sa santé.`
            : "Des repas sains font remonter sa santé."}
        </span>
      </Link>
    );
  }

  if (creature.hunger >= creature.hungerDamageThreshold) {
    return (
      <Link href="/feed" className="flex items-start gap-3 rounded-2xl border border-hunger/50 bg-hunger/10 px-4 py-3 text-sm text-cream-100">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-hunger" aria-hidden="true" />
        <span>
          <strong>{name} est affamée</strong> : sa santé baisse tant qu&apos;elle n&apos;a pas mangé.
        </span>
      </Link>
    );
  }

  if (creature.hunger >= 60) {
    return (
      <Link href="/feed" className="flex items-start gap-3 rounded-2xl border border-brass-500/40 bg-brass-500/10 px-4 py-3 text-sm text-cream-100">
        <Utensils className="mt-0.5 h-5 w-5 shrink-0 text-brass-300" aria-hidden="true" />
        <span>
          <strong>{name} a faim.</strong> Un repas avant que sa santé ne baisse ?
        </span>
      </Link>
    );
  }

  return null;
}

function formatDays(days: number): string {
  if (days < 1) return `${Math.max(1, Math.round(days * 24))} h`;
  const rounded = Math.round(days * 10) / 10;
  return `${rounded.toLocaleString("fr-FR")} jour${rounded >= 2 ? "s" : ""}`;
}
