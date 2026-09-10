"use client";

import { Check, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AccessoryIcon } from "@/components/accessories";
import { Creature, type EquippedAccessory } from "@/components/creatures/creature";
import { Environment } from "@/components/creatures/environment";
import { RARITY_COLORS } from "@/components/creatures/rarity-badge";
import { Alert } from "@/components/ui/alert";
import { SLOT_LABELS, SLOTS, type Accessory, type Slot } from "@/lib/accessories/catalog";
import type { Outfit } from "@/lib/accessories/service";
import { getSpecies } from "@/lib/creatures";
import type { CreatureView } from "@/lib/game/creature-view";
import { cn } from "@/lib/utils/cn";

type WardrobeProps = { creature: CreatureView; owned: Accessory[]; outfit: Outfit };

export function Wardrobe({ creature, owned, outfit: initialOutfit }: WardrobeProps) {
  const router = useRouter();
  const species = creature.species ? getSpecies(creature.species.id) : undefined;
  const [outfit, setOutfit] = useState<Outfit>(initialOutfit);
  const [slot, setSlot] = useState<Slot>("head");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const equipped: EquippedAccessory[] = SLOTS.flatMap((s) => (outfit[s] ? [{ slot: s, id: outfit[s]! }] : []));
  const items = owned.filter((a) => a.slot === slot);

  async function toggle(accessory: Accessory) {
    const next = outfit[accessory.slot] === accessory.id ? null : accessory.id;
    setPending(accessory.id);
    setError(null);
    const previous = outfit;
    setOutfit({ ...outfit, [accessory.slot]: next ?? undefined });
    try {
      const response = await fetch("/api/accessories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slot: accessory.slot, accessoryId: next }),
      });
      const body = (await response.json().catch(() => null)) as { outfit?: Outfit; error?: { message?: string } } | null;
      if (!response.ok || !body?.outfit) {
        setOutfit(previous);
        setError(body?.error?.message ?? "Impossible de modifier la tenue.");
        return;
      }
      setOutfit(body.outfit);
      router.refresh();
    } catch {
      setOutfit(previous);
      setError("Impossible de joindre le serveur.");
    } finally {
      setPending(null);
    }
  }

  if (!species) return null;

  return (
    <div className="space-y-4 animate-rise">
      <section className="relative overflow-hidden rounded-3xl border border-ink-600/80 shadow-card" style={{ height: 260 }}>
        <div className="absolute inset-0">
          <Environment tier={creature.tier} />
        </div>
        <div className="absolute inset-x-0 bottom-1 flex justify-center">
          <Creature species={species} stage={creature.stage.id} state={creature.state} size={220} accessories={equipped} />
        </div>
      </section>

      {error ? <Alert tone="danger">{error}</Alert> : null}

      <div className="grid grid-cols-4 gap-1 rounded-2xl border border-ink-600/80 bg-ink-800/80 p-1" role="tablist" aria-label="Emplacements">
        {SLOTS.map((s) => {
          const count = owned.filter((a) => a.slot === s).length;
          return (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={slot === s}
              onClick={() => setSlot(s)}
              className={cn("min-h-11 rounded-xl text-sm font-semibold", slot === s ? "bg-sage-800/60 text-sage-200" : "text-cream-500")}
            >
              {SLOT_LABELS[s]}
              <span className="ml-1 text-[10px] text-cream-700">{count}</span>
            </button>
          );
        })}
      </div>

      {items.length === 0 ? (
        <p className="rounded-3xl border border-ink-600/80 bg-ink-800/70 p-6 text-center text-sm text-cream-500">
          Aucun accessoire pour {SLOT_LABELS[slot].toLowerCase()} pour l&apos;instant. Marche 5 000 pas pour gagner un coffre !
        </p>
      ) : (
        <ul className="grid grid-cols-3 gap-2">
          {items.map((accessory) => {
            const active = outfit[accessory.slot] === accessory.id;
            return (
              <li key={accessory.id}>
                <button
                  type="button"
                  onClick={() => toggle(accessory)}
                  disabled={pending !== null}
                  aria-pressed={active}
                  className={cn(
                    "relative flex w-full flex-col items-center gap-1 rounded-2xl border bg-ink-800/90 p-2 text-center transition-colors",
                    active ? "border-sage-500 bg-sage-800/30" : "border-ink-600/80 hover:border-ink-400",
                  )}
                  style={{ boxShadow: `inset 0 0 0 1px ${RARITY_COLORS[accessory.rarity]}44` }}
                >
                  <AccessoryIcon id={accessory.id} size={72} palette={species.palette} />
                  <span className="text-xs font-semibold text-cream-100">{accessory.name}</span>
                  <span className="text-[10px]" style={{ color: RARITY_COLORS[accessory.rarity] }}>
                    {accessory.rarity === "tres_rare" ? "très rare" : accessory.rarity === "legendaire" ? "légendaire" : accessory.rarity}
                  </span>
                  {active ? (
                    <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-sage-500 text-ink-950">
                      {pending === accessory.id ? <X className="h-3 w-3" /> : <Check className="h-3 w-3" />}
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-center text-xs text-cream-700">Touche un accessoire pour l&apos;équiper, touche-le à nouveau pour le retirer.</p>
    </div>
  );
}
