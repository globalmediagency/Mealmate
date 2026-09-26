"use client";

import { Check, Lock, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AccessoryIcon } from "@/components/accessories";
import { Backdrop } from "@/components/backdrops";
import { SceneBackdrop } from "@/components/backdrops/scene-backdrop";
import { Creature, type EquippedAccessory } from "@/components/creatures/creature";
import { RARITY_COLORS, rarityTint } from "@/components/creatures/rarity-badge";
import { useThemeId } from "@/components/theme/theme-context";
import { Alert } from "@/components/ui/alert";
import { SLOT_LABELS, SLOTS, type Accessory, type Slot } from "@/lib/accessories/catalog";
import type { Outfit } from "@/lib/accessories/service";
import { backdropForTheme, CHEST_BACKDROPS, THEME_BACKDROPS, type Backdrop as BackdropEntry } from "@/lib/backdrops/catalog";
import { getSpecies } from "@/lib/creatures";
import type { CreatureView } from "@/lib/game/creature-view";
import { cn } from "@/lib/utils/cn";

type Tab = Slot | "backdrop";
const TABS: readonly Tab[] = [...SLOTS, "backdrop"];
const TAB_LABELS: Record<Tab, string> = { ...SLOT_LABELS, backdrop: "Fond" };

type WardrobeProps = {
  creature: CreatureView;
  owned: Accessory[];
  outfit: Outfit;
  counts?: Record<string, number>;
  /** Chest backdrops the player found (the five design scenes are always available). */
  ownedBackdrops?: string[];
  /** Dev galleries: no API call. */
  preview?: boolean;
};

const rarityLabel = (rarity: BackdropEntry["rarity"]) => (rarity === "tres_rare" ? "très rare" : rarity === "legendaire" ? "légendaire" : rarity);

export function Wardrobe({ creature, owned, outfit: initialOutfit, counts = {}, ownedBackdrops = [], preview = false }: WardrobeProps) {
  const router = useRouter();
  const theme = useThemeId();
  const species = creature.species ? getSpecies(creature.species.id) : undefined;
  const [outfit, setOutfit] = useState<Outfit>(initialOutfit);
  const [backdrop, setBackdrop] = useState<string | null>(creature.backdrop);
  const [tab, setTab] = useState<Tab>("head");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // `/wardrobe#fond` (from a chest that held a scene) opens the backdrop tab.
  useEffect(() => {
    if (window.location.hash === "#fond") setTab("backdrop");
  }, []);

  const equipped: EquippedAccessory[] = SLOTS.flatMap((s) => (outfit[s] ? [{ slot: s, id: outfit[s]! }] : []));
  const items = tab === "backdrop" ? [] : owned.filter((a) => a.slot === tab);
  const found = new Set(ownedBackdrops);

  async function toggle(accessory: Accessory) {
    const next = outfit[accessory.slot] === accessory.id ? null : accessory.id;
    setPending(accessory.id);
    setError(null);
    const previous = outfit;
    setOutfit({ ...outfit, [accessory.slot]: next ?? undefined });
    if (preview) {
      setPending(null);
      return;
    }
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

  /** `null` = follow the design (the scene of the design in force). */
  async function pickBackdrop(id: string | null) {
    if (id === backdrop) return;
    setPending(id ?? "auto");
    setError(null);
    const previous = backdrop;
    setBackdrop(id);
    if (preview) {
      setPending(null);
      return;
    }
    try {
      const response = await fetch("/api/backdrops", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ backdropId: id }) });
      const body = (await response.json().catch(() => null)) as { backdrop?: string | null; error?: { message?: string } } | null;
      if (!response.ok || !body) {
        setBackdrop(previous);
        setError(body?.error?.message ?? "Impossible de changer le décor.");
        return;
      }
      setBackdrop(body.backdrop ?? null);
      router.refresh();
    } catch {
      setBackdrop(previous);
      setError("Impossible de joindre le serveur.");
    } finally {
      setPending(null);
    }
  }

  if (!species) return null;

  const foundCount = CHEST_BACKDROPS.filter((b) => found.has(b.id)).length;

  return (
    <div className="space-y-4 animate-rise">
      <section className="relative overflow-hidden rounded-3xl border border-ink-600/80 shadow-card" style={{ height: 260 }} data-wardrobe-scene>
        <div className="absolute inset-0">
          <SceneBackdrop choice={backdrop} tier={creature.tier} />
        </div>
        <div className="absolute inset-x-0 bottom-1 flex justify-center">
          <Creature species={species} stage={creature.stage.id} state={creature.state} size={220} accessories={equipped} />
        </div>
      </section>

      {error ? <Alert tone="danger">{error}</Alert> : null}

      <div className="grid grid-cols-5 gap-1 rounded-2xl border border-ink-600/80 bg-ink-800/80 p-1" role="tablist" aria-label="Emplacements">
        {TABS.map((t) => {
          const count = t === "backdrop" ? THEME_BACKDROPS.length + foundCount : owned.filter((a) => a.slot === t).length;
          return (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              data-wardrobe-tab={t}
              onClick={() => setTab(t)}
              className={cn("min-h-11 rounded-xl text-sm font-semibold", tab === t ? "bg-sage-800/60 text-sage-200" : "text-cream-500")}
            >
              {TAB_LABELS[t]}
              <span className="ml-1 text-[10px] text-cream-700">{count}</span>
            </button>
          );
        })}
      </div>

      {tab === "backdrop" ? (
        <div className="space-y-3" data-backdrop-picker>
          <ul className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Décor derrière la créature">
            <li>
              <BackdropCard
                id={backdropForTheme(theme).id}
                tier={creature.tier}
                name="Selon le design"
                caption="suit le design du site"
                active={backdrop === null}
                pending={pending === "auto"}
                disabled={pending !== null}
                onPick={() => pickBackdrop(null)}
                value="auto"
              />
            </li>
            {THEME_BACKDROPS.map((b) => (
              <li key={b.id}>
                <BackdropCard id={b.id} tier={creature.tier} name={b.name} caption="design" active={backdrop === b.id} pending={pending === b.id} disabled={pending !== null} onPick={() => pickBackdrop(b.id)} value={b.id} />
              </li>
            ))}
            {CHEST_BACKDROPS.map((b) => (
              <li key={b.id}>
                <BackdropCard
                  id={b.id}
                  tier={creature.tier}
                  name={b.name}
                  caption={rarityLabel(b.rarity)}
                  captionColor={RARITY_COLORS[b.rarity]}
                  active={backdrop === b.id}
                  pending={pending === b.id}
                  disabled={pending !== null || !found.has(b.id)}
                  locked={!found.has(b.id)}
                  onPick={() => pickBackdrop(b.id)}
                  value={b.id}
                />
              </li>
            ))}
          </ul>
          <p className="text-center text-xs text-cream-700">
            {foundCount} décor{foundCount > 1 ? "s" : ""} trouvé{foundCount > 1 ? "s" : ""} sur {CHEST_BACKDROPS.length} : les autres se cachent dans les coffres, marche pour les découvrir !
          </p>
        </div>
      ) : items.length === 0 ? (
        <p className="rounded-3xl border border-ink-600/80 bg-ink-800/70 p-6 text-center text-sm text-cream-500">
          Aucun accessoire pour {TAB_LABELS[tab].toLowerCase()} pour l&apos;instant. Marche 5 000 pas pour gagner un coffre !
        </p>
      ) : (
        <>
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
                    style={{ boxShadow: `inset 0 0 0 1px ${rarityTint(accessory.rarity, 0.27)}` }}
                  >
                    <AccessoryIcon id={accessory.id} size={72} palette={species.palette} />
                    <span className="text-xs font-semibold text-cream-100">{accessory.name}</span>
                    {(counts[accessory.id] ?? 1) > 1 ? (
                      <span className="absolute left-1.5 top-1.5 rounded-full border border-brass-400/50 bg-ink-900/85 px-1.5 text-[10px] font-semibold text-brass-200" title="Exemplaires : à échanger ou offrir depuis l'onglet Amis">
                        ×{counts[accessory.id]}
                      </span>
                    ) : null}
                    <span className="text-[10px]" style={{ color: RARITY_COLORS[accessory.rarity] }}>
                      {rarityLabel(accessory.rarity)}
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
          <p className="text-center text-xs text-cream-700">Touche un accessoire pour l&apos;équiper, touche-le à nouveau pour le retirer.</p>
        </>
      )}
    </div>
  );
}

type BackdropCardProps = {
  id: BackdropEntry["id"];
  tier: CreatureView["tier"];
  name: string;
  caption: string;
  captionColor?: string;
  active: boolean;
  pending: boolean;
  disabled: boolean;
  locked?: boolean;
  onPick: () => void;
  value: string;
};

function BackdropCard({ id, tier, name, caption, captionColor, active, pending, disabled, locked = false, onPick, value }: BackdropCardProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      aria-disabled={locked || undefined}
      disabled={disabled}
      onClick={onPick}
      data-backdrop-option={value}
      data-locked={locked || undefined}
      title={locked ? "À trouver dans un coffre" : undefined}
      className={cn(
        "relative flex w-full flex-col overflow-hidden rounded-2xl border bg-ink-800/90 text-left transition-colors",
        active ? "border-sage-500" : "border-ink-600/80 hover:border-ink-400",
        locked && "opacity-60",
      )}
    >
      <span className="block h-20 w-full overflow-hidden">
        <Backdrop id={id} tier={tier} className={cn(locked && "grayscale")} />
      </span>
      <span className="flex min-h-11 flex-col justify-center px-2.5 py-1.5">
        <span className="text-xs font-semibold text-cream-100">{name}</span>
        <span className="text-[10px] text-cream-500" style={captionColor ? { color: captionColor } : undefined}>
          {locked ? "à trouver dans un coffre" : caption}
        </span>
      </span>
      {active ? (
        <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-sage-500 text-ink-950">
          {pending ? <X className="h-3 w-3" /> : <Check className="h-3 w-3" />}
        </span>
      ) : null}
      {locked ? (
        <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-ink-900/85 text-cream-300">
          <Lock className="h-3 w-3" aria-hidden="true" />
        </span>
      ) : null}
    </button>
  );
}
