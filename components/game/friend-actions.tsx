"use client";

import { ArrowLeftRight, HeartPulse, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AccessoryIcon } from "@/components/accessories";
import type { Accessory } from "@/lib/accessories/catalog";
import { RARITY_LABELS, SHOP_ITEMS, type ShopItemId } from "@/lib/game/config";
import { SHOP_ITEM_IDS } from "@/lib/game/medicine";
import type { FriendView } from "@/lib/friends/service";
import type { Inventory } from "@/lib/shop/service";
import type { TradeableAccessories } from "@/lib/trades/service";
import { ItemIcon } from "@/components/shop/item-icon";
import { cn } from "@/lib/utils/cn";

export type Notify = (tone: "success" | "danger" | "info", text: string) => void;

type ApiError = { error: { message: string } };

async function readError(response: Response, fallback: string): Promise<string> {
  const body = (await response.json().catch(() => null)) as ApiError | null;
  return body?.error?.message ?? fallback;
}

/** "Soigner" for a friend whose creature is tired or sick: sends one dose from my inventory. */
export function HealFriend({ friend, inventory, notify }: { friend: FriendView; inventory: Inventory; notify: Notify }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<ShopItemId | null>(null);
  const { creature } = friend;
  if (creature.status !== "alive" || creature.state === "healthy") return null;
  const total = SHOP_ITEM_IDS.reduce((sum, id) => sum + inventory[id], 0);

  async function send(item: ShopItemId) {
    setPending(item);
    try {
      const response = await fetch(`/api/friends/${friend.friendshipId}/heal`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ item }) });
      if (!response.ok) {
        notify("danger", await readError(response, "Envoi impossible."));
        return;
      }
      const body = (await response.json()) as { creatureName: string | null; health: number; healthDelta: number; cured: boolean; protectedUntil: string | null };
      const name = body.creatureName ?? "La créature";
      notify(
        "success",
        item === "talisman"
          ? `${name} de ${friend.user.username} est protégée pendant 7 jours grâce à toi !`
          : `${name} de ${friend.user.username} récupère ${body.healthDelta} points de santé (${body.health} %)${body.cured ? " et n'est plus malade" : ""}. Merci pour elle !`,
      );
      setOpen(false);
      router.refresh();
    } catch {
      notify("danger", "Impossible de joindre le serveur.");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={cn(
          "inline-flex min-h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold transition-colors",
          creature.state === "sick" ? "border-danger/50 bg-danger/15 text-danger hover:bg-danger/25" : "border-brass-400/50 bg-brass-500/15 text-brass-200 hover:bg-brass-500/25",
        )}
      >
        <HeartPulse className="h-4 w-4" aria-hidden="true" />
        Soigner
      </button>
      {open ? (
        <div className="mt-2 rounded-2xl border border-ink-600/80 bg-ink-900/70 p-3 animate-rise">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-cream-300">
              Envoyer un soin à <strong className="text-cream-50">{creature.name ?? "sa créature"}</strong>
            </p>
            <button type="button" onClick={() => setOpen(false)} aria-label="Fermer" className="flex h-8 w-8 items-center justify-center rounded-lg text-cream-500 hover:bg-ink-700">
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          {total === 0 ? (
            <p className="mt-2 text-xs text-cream-500">
              Ton armoire est vide.{" "}
              <Link href="/shop" className="underline text-brass-200">
                Passer par la boutique
              </Link>
              .
            </p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {SHOP_ITEM_IDS.map((item) => {
                const qty = inventory[item];
                return (
                  <li key={item}>
                    <button
                      type="button"
                      disabled={qty <= 0 || pending !== null}
                      onClick={() => send(item)}
                      className="flex min-h-11 w-full items-center gap-2 rounded-xl border border-ink-600 bg-ink-800 px-2 text-left text-sm text-cream-100 hover:border-sage-500/60 disabled:opacity-40"
                    >
                      <ItemIcon item={item} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="font-semibold">{SHOP_ITEMS[item].label}</span>
                        <span className="block text-[11px] text-cream-500">{SHOP_ITEMS[item].description}</span>
                      </span>
                      <span className="shrink-0 text-xs text-cream-500">× {qty}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

function AccessoryChip({ accessory, selected, onClick }: { accessory: Accessory; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "flex min-h-11 items-center gap-2 rounded-xl border px-2 py-1 text-left text-xs transition-colors",
        selected ? "border-sage-400 bg-sage-500/15 text-cream-50" : "border-ink-600 bg-ink-800 text-cream-300 hover:border-ink-400",
      )}
    >
      <AccessoryIcon id={accessory.id} size={36} className="shrink-0" />
      <span className="min-w-0">
        <span className="block truncate font-semibold">{accessory.name}</span>
        <span className="block text-[10px] uppercase tracking-wider text-cream-700">{RARITY_LABELS[accessory.rarity]}</span>
      </span>
    </button>
  );
}

/** "Échanger" with a friend: pick one of my accessories and one of theirs, then propose the swap. */
export function TradeWithFriend({ friend, notify, initialData = null }: { friend: FriendView; notify: Notify; initialData?: TradeableAccessories | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<TradeableAccessories | null>(initialData);
  const [loading, setLoading] = useState(false);
  const [offered, setOffered] = useState<string | null>(null);
  const [requested, setRequested] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const response = await fetch(`/api/friends/${friend.friendshipId}/accessories`);
      if (!response.ok) {
        notify("danger", await readError(response, "Impossible de charger les accessoires."));
        setOpen(false);
        return;
      }
      setData((await response.json()) as TradeableAccessories);
    } catch {
      notify("danger", "Impossible de joindre le serveur.");
      setOpen(false);
    } finally {
      setLoading(false);
    }
  }

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && !data && !loading) void load();
  }

  async function propose() {
    if (!offered || !requested) return;
    setPending(true);
    try {
      const response = await fetch("/api/trades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ friendshipId: friend.friendshipId, offeredId: offered, requestedId: requested }),
      });
      if (!response.ok) {
        notify("danger", await readError(response, "Proposition impossible."));
        return;
      }
      notify("success", `Proposition envoyée à ${friend.user.username}. Tu seras prévenu·e de sa réponse ici.`);
      setOpen(false);
      setData(null);
      setOffered(null);
      setRequested(null);
      router.refresh();
    } catch {
      notify("danger", "Impossible de joindre le serveur.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-ink-500 bg-ink-700 px-3 text-xs font-semibold text-cream-100 transition-colors hover:border-ink-400"
      >
        <ArrowLeftRight className="h-4 w-4" aria-hidden="true" />
        Échanger
      </button>
      {open ? (
        <div className="mt-2 rounded-2xl border border-ink-600/80 bg-ink-900/70 p-3 animate-rise">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-cream-300">
              Troc d&apos;accessoires avec <strong className="text-cream-50">{friend.user.username}</strong>
            </p>
            <button type="button" onClick={() => setOpen(false)} aria-label="Fermer" className="flex h-8 w-8 items-center justify-center rounded-lg text-cream-500 hover:bg-ink-700">
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          {loading || !data ? (
            <p className="mt-2 text-xs text-cream-500">Chargement des garde-robes…</p>
          ) : data.mine.length === 0 || data.theirs.length === 0 ? (
            <p className="mt-2 text-xs text-cream-500">
              {data.theirs.length === 0
                ? `Tu possèdes déjà tout ce que ${friend.user.username} pourrait t'échanger.`
                : `${friend.user.username} possède déjà tous tes accessoires : rien à proposer pour l'instant.`}{" "}
              Marche pour gagner de nouveaux coffres !
            </p>
          ) : (
            <div className="mt-2 space-y-3">
              <div>
                <p className="mb-1 text-[11px] uppercase tracking-wider text-cream-700">Je donne</p>
                <div className="flex flex-col gap-1.5">
                  {data.mine.map((a) => (
                    <AccessoryChip key={a.id} accessory={a} selected={offered === a.id} onClick={() => setOffered(a.id)} />
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-1 text-[11px] uppercase tracking-wider text-cream-700">Je reçois</p>
                <div className="flex flex-col gap-1.5">
                  {data.theirs.map((a) => (
                    <AccessoryChip key={a.id} accessory={a} selected={requested === a.id} onClick={() => setRequested(a.id)} />
                  ))}
                </div>
              </div>
              <button
                type="button"
                disabled={!offered || !requested || pending}
                onClick={propose}
                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-sage-500 px-4 text-sm font-semibold text-ink-950 hover:bg-sage-400 disabled:pointer-events-none disabled:opacity-50"
              >
                <ArrowLeftRight className="h-4 w-4" aria-hidden="true" />
                Proposer l&apos;échange
              </button>
              <p className="text-[11px] text-cream-700">{friend.user.username} pourra accepter ou refuser. Un accessoire échangé est retiré de la tenue de ta créature.</p>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
