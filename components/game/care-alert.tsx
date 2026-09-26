import { AlertTriangle, ChevronRight, HeartPulse, Utensils } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { HUNGER_ALERT_THRESHOLD } from "@/lib/game/config";
import type { CreatureView } from "@/lib/game/creature-view";
import { cn } from "@/lib/utils/cn";

type CareAlertProps = {
  creature: CreatureView;
  /** Medicine in the inventory: the sick alert then offers a dose (in place when `onHeal` is given, else the shop). */
  doses?: number;
  /** Opens the medicine cupboard in place (the creature screen); without it the alert links to the shop. */
  onHeal?: () => void;
};

/**
 * Actionable warning shown on the home screen when the creature needs care:
 * the "reason" line, with the matching action at its right ("Nourrir",
 * "Soigner"). The action tiles below highlight the same decision (`careAction`).
 */
export function CareAlert({ creature, doses = 0, onHeal }: CareAlertProps) {
  if (creature.status !== "alive") return null;
  const name = creature.name ?? "Ta créature";

  if (creature.state === "sick") {
    const left = creature.daysUntilDeath;
    const urgent = left !== null && left <= 1;
    const heal = doses > 0;
    const text = (
      <>
        <strong>{name} est malade.</strong>{" "}
        {left !== null && left <= 0
          ? heal
            ? "C'est la dernière limite : utilise un soin de ton armoire maintenant."
            : "C'est la dernière limite : nourris-la maintenant."
          : left !== null
            ? `Sans soins, il lui reste environ ${formatDays(left)}. `
            : ""}
        {left === null || left > 0 ? (heal ? "Tu as un soin dans ton armoire à pharmacie : c'est le moment." : "Des repas sains font remonter sa santé, ou un soin de la boutique.") : null}
      </>
    );
    const className = cn(
      "flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left text-sm",
      urgent ? "border-danger/60 bg-danger/15 text-cream-50" : "border-hunger/50 bg-hunger/10 text-cream-100",
    );
    const icon = <HeartPulse className={cn("h-5 w-5 shrink-0", urgent ? "text-danger" : "text-hunger")} aria-hidden="true" />;
    if (heal && onHeal) {
      return (
        <button type="button" onClick={onHeal} className={className} data-care-alert="heal">
          {icon}
          <span className="min-w-0 flex-1">{text}</span>
          <Action label="Soigner" />
        </button>
      );
    }
    return (
      <Link href={heal ? "/shop" : "/feed"} className={className} data-care-alert={heal ? "shop" : "feed"}>
        {icon}
        <span className="min-w-0 flex-1">{text}</span>
        <Action label={heal ? "Soigner" : "Nourrir"} />
      </Link>
    );
  }

  if (creature.hunger >= creature.hungerDamageThreshold) {
    return (
      <Link href="/feed" className="flex items-center gap-3 rounded-2xl border border-hunger/50 bg-hunger/10 px-4 py-3 text-sm text-cream-100" data-care-alert="feed">
        <AlertTriangle className="h-5 w-5 shrink-0 text-hunger" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <strong>{name} est affamée</strong> : sa santé baisse tant qu&apos;elle n&apos;a pas mangé.
        </span>
        <Action label="Nourrir" />
      </Link>
    );
  }

  if (creature.hunger >= HUNGER_ALERT_THRESHOLD) {
    return (
      <Link href="/feed" className="flex items-center gap-3 rounded-2xl border border-brass-500/40 bg-brass-500/10 px-4 py-3 text-sm text-cream-100" data-care-alert="feed">
        <Utensils className="h-5 w-5 shrink-0 text-brass-300" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <strong>{name} a faim.</strong> Un repas avant que sa santé ne baisse ?
        </span>
        <Action label="Nourrir" />
      </Link>
    );
  }

  return null;
}

function Action({ label }: { label: ReactNode }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-0.5 text-xs font-semibold text-cream-50">
      {label}
      <ChevronRight className="h-4 w-4" aria-hidden="true" />
    </span>
  );
}

function formatDays(days: number): string {
  if (days < 1) return `${Math.max(1, Math.round(days * 24))} h`;
  const rounded = Math.round(days * 10) / 10;
  return `${rounded.toLocaleString("fr-FR")} jour${rounded >= 2 ? "s" : ""}`;
}
