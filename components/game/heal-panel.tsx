"use client";

import { X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ItemIcon } from "@/components/shop/item-icon";
import { Alert } from "@/components/ui/alert";
import { SHOP_ITEMS, TALISMAN_PROTECTION_DAYS, type ShopItemId } from "@/lib/game/config";
import type { CreatureView } from "@/lib/game/creature-view";
import { SHOP_ITEM_IDS } from "@/lib/game/medicine";
import type { Inventory } from "@/lib/shop/service";

export type HealOutcome = { creature: CreatureView; inventory: Inventory; healthDelta: number; cured: boolean };

type HealPanelProps = {
  creatureName: string;
  inventory: Inventory;
  /** A creature boarded with the user; omitted = the user's own creature. */
  creatureId?: string;
  onClose: () => void;
  /** After a dose was applied (the caller may keep the fresh creature and inventory). */
  onHealed?: (outcome: HealOutcome) => void;
};

/**
 * The medicine cupboard opened in place under "Soigner": one tap applies a
 * dose to the creature without leaving its screen (spec § 3.9). Shared by the
 * creature screen and the pension screen.
 */
export function HealPanel({ creatureName, inventory: initialInventory, creatureId, onClose, onHealed }: HealPanelProps) {
  const router = useRouter();
  const [inventory, setInventory] = useState(initialInventory);
  const [pending, setPending] = useState<ShopItemId | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const doses = SHOP_ITEM_IDS.reduce((sum, id) => sum + inventory[id], 0);

  async function heal(item: ShopItemId) {
    setPending(item);
    setMessage(null);
    try {
      const response = await fetch("/api/inventory/use", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(creatureId ? { item, creatureId } : { item }),
      });
      const body = (await response.json().catch(() => null)) as { error?: { message?: string }; healthDelta?: number; cured?: boolean; inventory?: Inventory; creature?: CreatureView } | null;
      if (!response.ok || !body?.creature || !body.inventory) {
        setMessage({ tone: "danger", text: body?.error?.message ?? "Soin impossible." });
        return;
      }
      setInventory(body.inventory);
      setMessage({
        tone: "success",
        text:
          item === "talisman"
            ? `${creatureName} est protégée pendant ${TALISMAN_PROTECTION_DAYS} jours.`
            : `${creatureName} récupère ${body.healthDelta ?? 0} points de santé (${Math.round(body.creature.health)} %)${body.cured ? " et n'est plus malade" : ""}.`,
      });
      onHealed?.({ creature: body.creature, inventory: body.inventory, healthDelta: body.healthDelta ?? 0, cured: Boolean(body.cured) });
      router.refresh();
    } catch {
      setMessage({ tone: "danger", text: "Impossible de joindre le serveur." });
    } finally {
      setPending(null);
    }
  }

  return (
    <div id="soigner" className="scroll-mt-4 rounded-2xl border border-ink-600/80 bg-ink-900/70 p-3 animate-rise" data-heal-panel>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-cream-300">
          Un soin de ton armoire pour <strong className="text-cream-50">{creatureName}</strong>
        </p>
        <button type="button" onClick={onClose} aria-label="Fermer" className="-m-1.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-cream-500 hover:bg-ink-700">
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      {message ? (
        <Alert tone={message.tone} className="mt-2">
          {message.text}
        </Alert>
      ) : null}
      {doses === 0 ? (
        <p className="mt-2 text-sm text-cream-500">
          Ton armoire est vide.{" "}
          <Link href="/shop" className="font-semibold text-brass-200 underline">
            Passer par la boutique
          </Link>
          .
        </p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {SHOP_ITEM_IDS.map((item) => (
            <li key={item}>
              <button
                type="button"
                disabled={inventory[item] <= 0 || pending !== null}
                onClick={() => heal(item)}
                data-heal-item={item}
                className="flex min-h-11 w-full items-center gap-2 rounded-xl border border-ink-600 bg-ink-800 px-2 text-left text-sm text-cream-100 hover:border-sage-500/60 disabled:opacity-40"
              >
                <ItemIcon item={item} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="font-semibold">{SHOP_ITEMS[item].label}</span>
                  <span className="block text-xs text-cream-500">{SHOP_ITEMS[item].description}</span>
                </span>
                <span className="shrink-0 text-xs text-cream-500">{pending === item ? "…" : `× ${inventory[item]}`}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
