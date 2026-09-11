"use client";

import { Gift } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { SHOP_ITEMS } from "@/lib/game/config";
import type { GiftView } from "@/lib/shop/service";

/** "A friend sent you something" notice (medicine or accessory), dismissed once seen. Shown on every home screen. */
export function GiftsNotice({ gifts, creatureName }: { gifts: GiftView[]; creatureName?: string }) {
  const router = useRouter();
  const [hidden, setHidden] = useState(false);
  const [pending, setPending] = useState(false);
  if (hidden || gifts.length === 0) return null;

  async function dismiss() {
    setPending(true);
    try {
      await fetch("/api/gifts/seen", { method: "POST" });
    } catch {
      // Best effort: the notice will simply show again next time.
    } finally {
      setHidden(true);
      setPending(false);
      router.refresh();
    }
  }

  const hasAccessory = gifts.some((g) => g.kind === "accessory");
  return (
    <div role="status" className="rounded-2xl border border-health/40 bg-health/10 px-4 py-3 text-sm text-cream-100 animate-rise">
      <div className="flex items-start gap-3">
        <Gift className="mt-0.5 h-5 w-5 shrink-0 text-health" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{hasAccessory || !creatureName ? "Un cadeau pour toi !" : `Un coup de pouce pour ${creatureName} !`}</p>
          <ul className="mt-1 space-y-0.5 text-cream-300">
            {gifts.map((gift) => (
              <li key={gift.id}>
                <strong className="text-cream-100">{gift.from.username}</strong>{" "}
                {gift.kind === "accessory" ? (
                  <>
                    t&apos;a offert un accessoire : <strong className="text-cream-100">{gift.accessory.name}</strong>. Il t&apos;attend dans la garde-robe.
                  </>
                ) : (
                  <>t&apos;a envoyé un {SHOP_ITEMS[gift.item].label.toLowerCase()}{creatureName ? ` pour ${creatureName}` : " pour ta créature"}.</>
                )}
              </li>
            ))}
          </ul>
        </div>
        <button type="button" onClick={dismiss} disabled={pending} className="min-h-11 shrink-0 rounded-xl border border-health/40 px-3 text-xs font-semibold text-health hover:bg-health/15">
          Merci !
        </button>
      </div>
    </div>
  );
}
