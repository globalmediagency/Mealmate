"use client";

import { Gamepad2, Gift, Heart, HeartPulse, Smile, Tent, Utensils, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Creature, type EquippedAccessory, type Reaction } from "@/components/creatures/creature";
import { Environment } from "@/components/creatures/environment";
import { RarityBadge } from "@/components/creatures/rarity-badge";
import { ItemIcon } from "@/components/shop/item-icon";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import type { BoardingView } from "@/lib/boarding/service";
import { getSpecies } from "@/lib/creatures";
import type { PublicProfile } from "@/lib/friends/service";
import type { ChestStatus } from "@/lib/game/accessories";
import { SHOP_ITEMS, type ShopItemId } from "@/lib/game/config";
import type { CreatureView } from "@/lib/game/creature-view";
import { ageLabel, creatureLine, hungerLabel } from "@/lib/game/dialogue";
import { SHOP_ITEM_IDS } from "@/lib/game/medicine";
import type { Inventory } from "@/lib/shop/service";
import { cn } from "@/lib/utils/cn";
import { EndBoardingButton } from "./boarding-actions";
import { formatEndDate } from "./boarded-away";
import { ChestOpener } from "./chest-reveal";
import { Gauge } from "./gauge";

type Props = {
  creature: CreatureView;
  accessories: EquippedAccessory[];
  boarding: BoardingView;
  owner: PublicProfile;
  /** The host's medicine, usable on this creature. */
  inventory: Inventory;
  chest: ChestStatus | null;
};

/** The host's screen for a creature a friend entrusted to them: play, heal, open its chests, send it home. */
export function PensionHome({ creature: initial, accessories, boarding, owner, inventory: initialInventory, chest }: Props) {
  const router = useRouter();
  const [creature, setCreature] = useState(initial);
  const [inventory, setInventory] = useState(initialInventory);
  const [healOpen, setHealOpen] = useState(false);
  const [pending, setPending] = useState<ShopItemId | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [reaction, setReaction] = useState<Reaction | null>(null);
  const [bubble, setBubble] = useState(creatureLine(initial));
  const timer = useRef<number | null>(null);
  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);

  const species = creature.species ? getSpecies(creature.species.id) : undefined;
  if (!species) return null;
  const doses = SHOP_ITEM_IDS.reduce((sum, id) => sum + inventory[id], 0);

  function tap() {
    if (reaction) return;
    setReaction("tap");
    setBubble(creature.state === "sick" ? "Doucement…" : "Hihi !");
    timer.current = window.setTimeout(() => {
      setReaction(null);
      setBubble(creatureLine(creature));
    }, 1300);
  }

  async function heal(item: ShopItemId) {
    setPending(item);
    setMessage(null);
    try {
      const response = await fetch("/api/inventory/use", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ item, creatureId: creature.id }) });
      const body = (await response.json().catch(() => null)) as { error?: { message?: string }; healthDelta?: number; cured?: boolean; inventory?: Inventory; creature?: CreatureView } | null;
      if (!response.ok || !body?.creature || !body.inventory) {
        setMessage({ tone: "danger", text: body?.error?.message ?? "Soin impossible." });
        return;
      }
      setCreature(body.creature);
      setInventory(body.inventory);
      setMessage({
        tone: "success",
        text: item === "talisman" ? `${creature.name} est protégée pendant 7 jours.` : `${creature.name} récupère ${body.healthDelta ?? 0} points de santé${body.cured ? " et n'est plus malade" : ""}.`,
      });
      setHealOpen(false);
      router.refresh();
    } catch {
      setMessage({ tone: "danger", text: "Impossible de joindre le serveur." });
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="space-y-4 animate-rise">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate font-display text-3xl font-semibold tracking-tight text-cream-50">{creature.name}</h1>
          <p className="mt-0.5 text-sm text-cream-500">
            {species.name} · {ageLabel(creature.ageDays)} · confiée par {owner.username}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {creature.rarity ? <RarityBadge rarity={creature.rarity} /> : null}
          <Badge>{creature.stage.label}</Badge>
        </div>
      </header>

      <Alert tone="info" title={`En pension chez toi jusqu'au ${formatEndDate(boarding.endsAt)}`}>
        Encore {boarding.daysLeft} jour{boarding.daysLeft > 1 ? "s" : ""}. Tes repas et tes pas comptent aussi pour elle. Tu ne peux pas changer ses accessoires, mais les coffres
        qu&apos;elle gagne chez toi sont pour toi.
      </Alert>
      {creature.state === "sick" ? (
        <Alert tone="danger" title={`${creature.name} est malade`}>
          {creature.daysUntilDeath !== null && creature.daysUntilDeath <= 1 ? "C'est la dernière limite. " : ""}
          {doses > 0 ? "Utilise un soin de ton armoire ci-dessous, ou nourris-la sainement." : "Des repas sains font remonter sa santé, ou un soin de la boutique."}
        </Alert>
      ) : null}
      {message ? <Alert tone={message.tone}>{message.text}</Alert> : null}

      <section className="relative overflow-hidden rounded-3xl border border-ink-600/80 shadow-card" style={{ height: "min(50vh, 420px)" }}>
        <div className="absolute inset-0">
          <Environment tier={creature.tier} />
        </div>
        <div className="absolute inset-x-4 top-4 flex justify-center">
          <p key={bubble} className="max-w-[85%] rounded-2xl rounded-bl-sm border border-cream-100/10 bg-ink-900/80 px-4 py-2 text-center text-sm text-cream-100 backdrop-blur animate-rise" aria-live="polite">
            {bubble}
          </p>
        </div>
        <button type="button" onClick={tap} aria-label={`Caresser ${creature.name}`} className="absolute inset-x-0 bottom-2 flex justify-center focus-visible:outline-none">
          <Creature species={species} stage={creature.stage.id} state={creature.state} size={240} reaction={reaction} accessories={accessories} />
        </button>
        <div className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full border border-cream-100/10 bg-ink-900/80 px-3 py-1.5 text-xs font-semibold text-cream-100 backdrop-blur">
          <Tent className="h-4 w-4 text-sage-300" aria-hidden="true" />
          Pension
        </div>
      </section>

      <section className="space-y-3 rounded-3xl border border-ink-600/80 bg-ink-800/90 p-4 shadow-card">
        <Gauge icon={Heart} label="Santé" value={creature.health} barClass="bg-health" />
        <Gauge icon={Utensils} label="Faim" value={creature.hunger} barClass="bg-hunger" caption={hungerLabel(creature.hunger)} />
        <Gauge icon={Smile} label="Humeur" value={creature.mood} barClass="bg-mood" />
        <p className="pt-1 text-xs text-cream-700">
          {creature.xp} XP
          {creature.xpToNextStage !== null ? ` · encore ${creature.xpToNextStage} XP avant le stade suivant` : " · stade maximal atteint"}
        </p>
      </section>

      <nav aria-label="Actions" className="grid grid-cols-2 gap-2">
        <Link href={`/play?creature=${creature.id}`} className={cn(buttonClasses("secondary", "md"), "min-h-14 flex-col gap-1 text-xs")}>
          <Gamepad2 className="h-5 w-5" aria-hidden="true" />
          Jouer
        </Link>
        <button
          type="button"
          onClick={() => setHealOpen((v) => !v)}
          aria-expanded={healOpen}
          className={cn(buttonClasses(creature.state === "sick" || (creature.state === "tired" && doses > 0) ? "brass" : "secondary", "md"), "min-h-14 flex-col gap-1 text-xs")}
        >
          <HeartPulse className="h-5 w-5" aria-hidden="true" />
          {doses > 0 ? `Soigner (${doses})` : "Soigner"}
        </button>
      </nav>

      {healOpen ? (
        <div className="rounded-2xl border border-ink-600/80 bg-ink-900/70 p-3 animate-rise">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-cream-300">
              Un soin de ton armoire pour <strong className="text-cream-50">{creature.name}</strong>
            </p>
            <button type="button" onClick={() => setHealOpen(false)} aria-label="Fermer" className="-m-1.5 flex h-11 w-11 items-center justify-center rounded-xl text-cream-500 hover:bg-ink-700">
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          {doses === 0 ? (
            <p className="mt-2 text-xs text-cream-500">
              Ton armoire est vide.{" "}
              <Link href="/shop" className="text-brass-200 underline">
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
                    className="flex min-h-11 w-full items-center gap-2 rounded-xl border border-ink-600 bg-ink-800 px-2 text-left text-sm text-cream-100 hover:border-sage-500/60 disabled:opacity-40"
                  >
                    <ItemIcon item={item} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="font-semibold">{SHOP_ITEMS[item].label}</span>
                      <span className="block text-[11px] text-cream-500">{SHOP_ITEMS[item].description}</span>
                    </span>
                    <span className="shrink-0 text-xs text-cream-500">× {inventory[item]}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {chest ? (
        <div className="space-y-2">
          <p className="flex items-center gap-2 text-xs text-cream-500">
            <Gift className="h-4 w-4 text-brass-300" aria-hidden="true" />
            Les coffres de {creature.name} pendant la pension sont pour toi.
          </p>
          <ChestOpener status={chest} canEquip={false} creatureId={creature.id} />
        </div>
      ) : null}

      <EndBoardingButton boardingId={boarding.id} label={`Rendre ${creature.name} à ${owner.username}`} variant="secondary" afterHref="/home" />
    </div>
  );
}
