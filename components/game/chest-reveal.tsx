"use client";

import { Gift, Image as ImageIcon, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AccessoryIcon } from "@/components/accessories";
import { Backdrop } from "@/components/backdrops";
import { rarityTint, RarityBadge } from "@/components/creatures/rarity-badge";
import { Alert } from "@/components/ui/alert";
import { Button, LinkButton } from "@/components/ui/button";
import type { Accessory } from "@/lib/accessories/catalog";
import { SLOT_LABELS } from "@/lib/accessories/catalog";
import type { Backdrop as BackdropEntry } from "@/lib/backdrops/catalog";
import type { ChestStatus } from "@/lib/game/accessories";
import type { Tier } from "@/lib/game/config";

/** What `POST /api/accessories/open` (or a coaching reward) hands back: an accessory, or a scene for the wardrobe (spec § 3.28). */
export type Reward =
  | { kind?: "accessory"; accessory: Accessory; duplicate: boolean; copies: number; equipped?: boolean; status: ChestStatus }
  | { kind: "backdrop"; backdrop: BackdropEntry; equipped?: boolean; status: ChestStatus };
type Phase = "closed" | "shaking" | "open";

type ChestOpenerProps = {
  status: ChestStatus;
  canEquip: boolean;
  /** A creature boarded with the user (default: the user's own creature). */
  creatureId?: string;
  /** Tier of the creature whose chest opens (the backdrop preview follows it). */
  tier?: Tier;
  /** "chest": step chests (default). "reward": coaching surprise accessories (points = thumbs). */
  mode?: "chest" | "reward";
  /** Endpoint and body used to open (default: the step chest of `creatureId`). */
  endpoint?: string;
  body?: Record<string, unknown>;
  /** Dev galleries: show this reward at once instead of calling the endpoint. */
  preview?: Reward;
};

const WORDING = {
  chest: { one: "coffre", many: "coffres", open: "Ouvrir un coffre", next: "Ouvrir le coffre suivant", unit: "pas", each: "Chaque coffre contient un accessoire aléatoire, ou parfois un nouveau décor pour ta créature." },
  reward: { one: "récompense", many: "récompenses", open: "Ouvrir une récompense", next: "Ouvrir la récompense suivante", unit: "pouces", each: "Chaque récompense contient un accessoire surprise." },
} as const;

/** Chest counter + opening animation + reward (spec § 3.6); also used for coaching rewards (spec § 3.17). */
export function ChestOpener({ status: initial, canEquip, creatureId, tier = "facile", mode = "chest", endpoint = "/api/accessories/open", body: payload, preview }: ChestOpenerProps) {
  const words = WORDING[mode];
  const router = useRouter();
  const [status, setStatus] = useState(initial);
  const [phase, setPhase] = useState<Phase>(preview ? "open" : "closed");
  const [reward, setReward] = useState<Reward | null>(preview ?? null);
  const [error, setError] = useState<string | null>(null);
  const [equipped, setEquipped] = useState(Boolean(preview?.equipped));

  async function open() {
    setError(null);
    setReward(null);
    setEquipped(false);
    setPhase("shaking");
    const wait = new Promise<void>((resolve) => setTimeout(resolve, 1300));
    try {
      const [response] = await Promise.all([
        fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload ?? (creatureId ? { creatureId } : {})) }),
        wait,
      ]);
      const body = (await response.json().catch(() => null)) as Reward | { error: { message: string } } | null;
      if (!response.ok || !body || "error" in body) {
        setError(body && "error" in body ? body.error.message : "Le coffre est resté fermé. Réessaie.");
        setPhase("closed");
        return;
      }
      setReward(body);
      setEquipped(Boolean(body.equipped));
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
    const response =
      reward.kind === "backdrop"
        ? await fetch("/api/backdrops", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ backdropId: reward.backdrop.id }) })
        : await fetch("/api/accessories", {
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
    <section className="rounded-3xl border border-ink-600/80 bg-ink-800/90 p-5 text-center shadow-card" data-chest-reward={reward ? (reward.kind ?? "accessory") : undefined}>
      {phase === "open" && reward ? (
        <div className="animate-rise">
          {reward.kind === "backdrop" ? (
            <>
              <div
                className="mx-auto h-36 w-full max-w-xs overflow-hidden rounded-3xl border border-ink-600/80 mm-pop-in"
                style={{ boxShadow: `0 0 50px ${rarityTint(reward.backdrop.rarity, 0.4)}` }}
              >
                <Backdrop id={reward.backdrop.id} tier={tier} />
              </div>
              <p className="mt-3 text-xs uppercase tracking-[0.2em] text-cream-500">Nouveau décor</p>
              <h2 className="mt-1 font-display text-3xl font-semibold text-cream-50">{reward.backdrop.name}</h2>
              <div className="mt-2 flex justify-center">
                <RarityBadge rarity={reward.backdrop.rarity} />
              </div>
              <p className="mt-2 text-sm text-cream-300">{reward.backdrop.tagline}</p>
            </>
          ) : (
            <>
              <div
                className="mx-auto flex h-36 w-36 items-center justify-center rounded-full mm-pop-in"
                style={{ boxShadow: `0 0 50px ${rarityTint(reward.accessory.rarity, 0.4)}`, background: rarityTint(reward.accessory.rarity, 0.1) }}
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
                  Exemplaire n° {reward.copies} : à échanger ou à offrir à un ami depuis l&apos;onglet Amis !
                </p>
              ) : null}
            </>
          )}
          <div className="mt-4 flex flex-col gap-2">
            {canEquip ? (
              <Button onClick={equip} disabled={equipped} variant="brass">
                {reward.kind === "backdrop" ? <ImageIcon className="h-5 w-5" aria-hidden="true" /> : <Sparkles className="h-5 w-5" aria-hidden="true" />}
                {reward.kind === "backdrop"
                  ? equipped
                    ? reward.equipped
                      ? "Déjà en place"
                      : "Décor installé !"
                    : "Mettre ce décor"
                  : equipped
                    ? reward.equipped
                      ? "Déjà porté"
                      : "Équipé !"
                    : "Équiper maintenant"}
              </Button>
            ) : null}
            {status.available > 0 ? (
              <Button onClick={open} variant="secondary">
                <Gift className="h-5 w-5" aria-hidden="true" />
                {words.next} ({status.available})
              </Button>
            ) : null}
            <LinkButton href={reward.kind === "backdrop" ? "/wardrobe#fond" : "/wardrobe"} variant="ghost">
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
                {status.available} {status.available > 1 ? words.many : words.one} à ouvrir !
              </h2>
              <p className="mt-1 text-sm text-cream-500">{words.each}</p>
              <Button onClick={open} disabled={phase === "shaking"} variant="brass" className="mt-4">
                <Gift className="h-5 w-5" aria-hidden="true" />
                {phase === "shaking" ? "Ça s'ouvre…" : words.open}
              </Button>
            </>
          ) : (
            <>
              <h2 className="mt-2 font-display text-xl font-semibold text-cream-50">
                {mode === "chest" ? "Prochain coffre" : "Prochain accessoire"} dans {status.stepsToNext.toLocaleString("fr-FR")} {words.unit}
              </h2>
              <div className="mx-auto mt-3 h-2.5 max-w-xs overflow-hidden rounded-full bg-ink-600" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
                <div className="h-full rounded-full bg-gradient-to-r from-sage-600 to-brass-400" style={{ width: `${progress}%` }} />
              </div>
              <p className="mt-2 text-xs text-cream-700">
                {mode === "chest"
                  ? `Un coffre tous les ${status.stepsPerChest.toLocaleString("fr-FR")} pas depuis l'éclosion`
                  : `Une récompense tous les ${status.stepsPerChest.toLocaleString("fr-FR")} pouces`}
                {" · "}
                {status.opened} ouvert{status.opened > 1 ? "s" : ""}
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
