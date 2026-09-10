"use client";

import { Gift, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AccessoryIcon } from "@/components/accessories";
import { RARITY_COLORS, RarityBadge } from "@/components/creatures/rarity-badge";
import { Alert } from "@/components/ui/alert";
import { Button, LinkButton } from "@/components/ui/button";
import type { Accessory } from "@/lib/accessories/catalog";
import { SLOT_LABELS } from "@/lib/accessories/catalog";
import type { ChestStatus } from "@/lib/game/accessories";

type Reward = { accessory: Accessory; duplicate: boolean; xpGain: number; status: ChestStatus };
type Phase = "closed" | "shaking" | "open";

type ChestOpenerProps = { status: ChestStatus; canEquip: boolean };

/** Chest counter + opening animation + reward (spec § 3.6). */
export function ChestOpener({ status: initial, canEquip }: ChestOpenerProps) {
  const router = useRouter();
  const [status, setStatus] = useState(initial);
  const [phase, setPhase] = useState<Phase>("closed");
  const [reward, setReward] = useState<Reward | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [equipped, setEquipped] = useState(false);

  async function open() {
    setError(null);
    setReward(null);
    setEquipped(false);
    setPhase("shaking");
    const wait = new Promise<void>((resolve) => setTimeout(resolve, 1300));
    try {
      const [response] = await Promise.all([fetch("/api/accessories/open", { method: "POST" }), wait]);
      const body = (await response.json().catch(() => null)) as Reward | { error: { message: string } } | null;
      if (!response.ok || !body || "error" in body) {
        setError(body && "error" in body ? body.error.message : "Le coffre est resté fermé. Réessaie.");
        setPhase("closed");
        return;
      }
      setReward(body);
      setStatus(body.status);
      setPhase("open");
      router.refresh();
    } catch {
      setError("Impossible de joindre le serveur.");
      setPhase("closed");
    }
  }

  async function equip() {
    if (!reward) return;
    const response = await fetch("/api/accessories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slot: reward.accessory.slot, accessoryId: reward.accessory.id }),
    });
    if (response.ok) {
      setEquipped(true);
      router.refresh();
    }
  }

  const progress = Math.round(((status.stepsPerChest - status.stepsToNext) / status.stepsPerChest) * 100);

  return (
    <section className="rounded-3xl border border-ink-600/80 bg-ink-800/90 p-5 text-center shadow-card">
      {phase === "open" && reward ? (
        <div className="animate-rise">
          <div
            className="mx-auto flex h-36 w-36 items-center justify-center rounded-full mm-pop-in"
            style={{ boxShadow: `0 0 50px ${RARITY_COLORS[reward.accessory.rarity]}66`, background: `${RARITY_COLORS[reward.accessory.rarity]}1a` }}
          >
            <AccessoryIcon id={reward.accessory.id} size={120} />
          </div>
          <p className="mt-3 text-xs uppercase tracking-[0.2em] text-cream-500">{SLOT_LABELS[reward.accessory.slot]}</p>
          <h2 className="mt-1 font-display text-3xl font-semibold text-cream-50">{reward.accessory.name}</h2>
          <div className="mt-2 flex justify-center">
            <RarityBadge rarity={reward.accessory.rarity} />
          </div>
          <p className="mt-2 text-sm text-cream-300">{reward.accessory.tagline}</p>
          {reward.duplicate ? (
            <p className="mt-3 rounded-2xl border border-brass-500/40 bg-brass-500/10 px-3 py-2 text-sm text-brass-200">
              Déjà possédé · +{reward.xpGain} XP pour ta créature
            </p>
          ) : null}
          <div className="mt-4 flex flex-col gap-2">
            {!reward.duplicate && canEquip ? (
              <Button onClick={equip} disabled={equipped} variant="brass">
                <Sparkles className="h-5 w-5" aria-hidden="true" />
                {equipped ? "Équipé !" : "Équiper maintenant"}
              </Button>
            ) : null}
            {status.available > 0 ? (
              <Button onClick={open} variant="secondary">
                <Gift className="h-5 w-5" aria-hidden="true" />
                Ouvrir le coffre suivant ({status.available})
              </Button>
            ) : null}
            <LinkButton href="/wardrobe" variant="ghost">
              Voir la garde-robe
            </LinkButton>
          </div>
        </div>
      ) : (
        <div>
          <div className={`mx-auto ${phase === "shaking" ? "mm-egg-shake" : ""}`} style={{ width: 120, height: 110 }}>
            <ChestSvg glowing={status.available > 0} shaking={phase === "shaking"} />
          </div>
          {error ? <Alert tone="danger" className="mt-3 text-left">{error}</Alert> : null}
          {status.available > 0 ? (
            <>
              <h2 className="mt-2 font-display text-2xl font-semibold text-cream-50">
                {status.available} coffre{status.available > 1 ? "s" : ""} à ouvrir !
              </h2>
              <p className="mt-1 text-sm text-cream-500">Chaque coffre contient un accessoire aléatoire.</p>
              <Button onClick={open} disabled={phase === "shaking"} variant="brass" className="mt-4">
                <Gift className="h-5 w-5" aria-hidden="true" />
                {phase === "shaking" ? "Ça s'ouvre…" : "Ouvrir un coffre"}
              </Button>
            </>
          ) : (
            <>
              <h2 className="mt-2 font-display text-xl font-semibold text-cream-50">Prochain accessoire dans {status.stepsToNext.toLocaleString("fr-FR")} pas</h2>
              <div className="mx-auto mt-3 h-2.5 max-w-xs overflow-hidden rounded-full bg-ink-600" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
                <div className="h-full rounded-full bg-gradient-to-r from-sage-600 to-brass-400" style={{ width: `${progress}%` }} />
              </div>
              <p className="mt-2 text-xs text-cream-700">
                Un coffre tous les {status.stepsPerChest.toLocaleString("fr-FR")} pas depuis l&apos;éclosion · {status.opened} ouvert{status.opened > 1 ? "s" : ""}
              </p>
            </>
          )}
        </div>
      )}
    </section>
  );
}

function ChestSvg({ glowing, shaking }: { glowing: boolean; shaking: boolean }) {
  return (
    <svg viewBox="0 0 120 110" width="120" height="110" aria-hidden="true">
      {glowing ? <ellipse cx="60" cy="60" rx="56" ry="46" fill="#F0D68F" opacity="0.18" className={shaking ? "mm-pulse-soft" : ""} /> : null}
      <ellipse cx="60" cy="100" rx="42" ry="6" fill="#000" opacity="0.3" />
      <rect x="18" y="52" width="84" height="44" rx="8" fill="#8C5A3A" stroke="#5E4630" strokeWidth="2" />
      <path d="M18 60 C18 40 102 40 102 60 L102 66 L18 66 Z" fill="#A6703F" stroke="#5E4630" strokeWidth="2" />
      <rect x="18" y="64" width="84" height="6" fill="#5E4630" />
      <rect x="26" y="52" width="6" height="44" fill="#E8C36A" opacity="0.9" />
      <rect x="88" y="52" width="6" height="44" fill="#E8C36A" opacity="0.9" />
      <rect x="52" y="60" width="16" height="16" rx="3" fill="#E8C36A" stroke="#A6823A" strokeWidth="1.5" />
      <circle cx="60" cy="68" r="2.5" fill="#5E4630" />
      {glowing ? (
        <g fill="#F0D68F">
          <path d="M20 30 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z" className="mm-twinkle" />
          <path d="M98 26 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z" className="mm-twinkle" style={{ animationDelay: "0.5s" }} />
          <path d="M60 14 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z" className="mm-twinkle" style={{ animationDelay: "1s" }} />
        </g>
      ) : null}
    </svg>
  );
}
