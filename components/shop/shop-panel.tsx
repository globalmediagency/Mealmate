"use client";

import { ExternalLink, HeartHandshake, ShoppingBag } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardText, CardTitle } from "@/components/ui/card";
import { SHOP_ITEMS, type ShopItemId } from "@/lib/game/config";
import { formatPrice, SHOP_ITEM_IDS } from "@/lib/game/medicine";
import type { ConfirmOutcome, Inventory, PurchaseView } from "@/lib/shop/service";
import { ItemIcon } from "./item-icon";

type Message = { tone: "success" | "danger" | "info" | "warning"; text: string };

export type ShopPanelProps = {
  inventory: Inventory;
  purchases: PurchaseView[];
  /** STRIPE_SECRET_KEY is set: purchases are possible. */
  stripeEnabled: boolean;
  /** STRIPE_WEBHOOK_SECRET is missing: confirmation relies on the return to this page. */
  webhookMissing: boolean;
  testMode: boolean;
  creature: { name: string; health: number } | null;
  checkout: { success: boolean; cancelled: boolean; sessionId: string | null };
};

const STATUS_LABELS: Record<string, string> = { paid: "Payé", pending: "En attente", cancelled: "Annulé" };

export function ShopPanel({ inventory: initialInventory, purchases, stripeEnabled, webhookMissing, testMode, creature, checkout }: ShopPanelProps) {
  const router = useRouter();
  const [inventory, setInventory] = useState(initialInventory);
  const [message, setMessage] = useState<Message | null>(checkout.cancelled ? { tone: "info", text: "Paiement annulé. Rien n'a été débité." } : null);
  const [pending, setPending] = useState<string | null>(null);
  const confirmed = useRef(false);

  useEffect(() => {
    setInventory(initialInventory);
  }, [initialInventory]);

  useEffect(() => {
    if (!checkout.success || !checkout.sessionId || confirmed.current) return;
    confirmed.current = true;
    setPending("confirm");
    setMessage({ tone: "info", text: "Vérification du paiement…" });
    fetch(`/api/shop/confirm?session_id=${encodeURIComponent(checkout.sessionId)}`)
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as (ConfirmOutcome & { inventory: Inventory }) | { error: { message: string } } | null;
        if (!response.ok || !body || "error" in body) {
          setMessage({ tone: "danger", text: body && "error" in body ? body.error.message : "Impossible de vérifier le paiement." });
          return;
        }
        setInventory(body.inventory);
        const label = body.item ? SHOP_ITEMS[body.item].label.toLowerCase() : "ton achat";
        if (body.status === "paid") setMessage({ tone: "success", text: `Merci ! ${capitalize(label)} est dans ton armoire à pharmacie.` });
        else if (body.status === "pending") setMessage({ tone: "warning", text: "Paiement en cours de confirmation : reviens dans un instant." });
        else if (body.status === "cancelled") setMessage({ tone: "info", text: "Paiement annulé. Rien n'a été débité." });
        else setMessage({ tone: "warning", text: "Session de paiement introuvable." });
        window.history.replaceState(null, "", "/shop");
        router.refresh();
      })
      .catch(() => setMessage({ tone: "danger", text: "Impossible de joindre le serveur." }))
      .finally(() => setPending(null));
  }, [checkout.success, checkout.sessionId, router]);

  async function buy(item: ShopItemId) {
    setPending(`buy-${item}`);
    setMessage(null);
    try {
      const response = await fetch("/api/shop/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ item }) });
      const body = (await response.json().catch(() => null)) as { url: string } | { error: { message: string } } | null;
      if (!response.ok || !body || "error" in body) {
        setMessage({ tone: "danger", text: body && "error" in body ? body.error.message : "Paiement indisponible pour le moment." });
        setPending(null);
        return;
      }
      window.location.assign(body.url);
    } catch {
      setMessage({ tone: "danger", text: "Impossible de joindre le serveur." });
      setPending(null);
    }
  }

  async function applyDose(item: ShopItemId) {
    setPending(`use-${item}`);
    setMessage(null);
    try {
      const response = await fetch("/api/inventory/use", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ item }) });
      const body = (await response.json().catch(() => null)) as
        | { healthDelta: number; cured: boolean; protectedUntil: string | null; inventory: Inventory; creature: { name: string | null; health: number } }
        | { error: { message: string } }
        | null;
      if (!response.ok || !body || "error" in body) {
        setMessage({ tone: "danger", text: body && "error" in body ? body.error.message : "Soin impossible." });
        return;
      }
      setInventory(body.inventory);
      const name = body.creature.name ?? "Ta créature";
      if (item === "talisman" && body.protectedUntil) {
        setMessage({ tone: "success", text: `${name} est protégée jusqu'au ${new Date(body.protectedUntil).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}.` });
      } else {
        setMessage({ tone: "success", text: `${name} récupère ${body.healthDelta} points de santé (${Math.round(body.creature.health)} %)${body.cured ? " et n'est plus malade" : ""} !` });
      }
      router.refresh();
    } catch {
      setMessage({ tone: "danger", text: "Impossible de joindre le serveur." });
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="space-y-5 animate-rise">
      {message ? <Alert tone={message.tone}>{message.text}</Alert> : null}

      <Card>
        <CardTitle className="text-lg">Mon armoire à pharmacie</CardTitle>
        <CardText className="mt-1">
          {creature ? `Pour ${creature.name} (santé ${Math.round(creature.health)} %).` : "Tu pourras utiliser tes soins dès que tu auras une créature."}
        </CardText>
        <ul className="mt-3 divide-y divide-ink-600/80">
          {SHOP_ITEM_IDS.map((item) => {
            const qty = inventory[item];
            const useless = creature !== null && item !== "talisman" && creature.health >= 100;
            const disabled = qty <= 0 || !creature || useless || pending !== null;
            return (
              <li key={item} className="flex items-center gap-3 py-3">
                <ItemIcon item={item} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-cream-50">
                    {SHOP_ITEMS[item].label} <span className="font-normal text-cream-500">× {qty}</span>
                  </p>
                  {useless && qty > 0 ? <p className="text-xs text-cream-700">Santé au maximum, garde-le pour plus tard.</p> : null}
                </div>
                <Button size="md" variant={qty > 0 && !disabled ? "primary" : "secondary"} className="w-auto px-3" disabled={disabled} onClick={() => applyDose(item)}>
                  Utiliser
                </Button>
              </li>
            );
          })}
        </ul>
        <p className="mt-2 flex items-start gap-2 text-xs text-cream-500">
          <HeartHandshake className="mt-0.5 h-4 w-4 shrink-0 text-sage-300" aria-hidden="true" />
          <span>
            Un ami a une créature mal en point ? Depuis l&apos;onglet{" "}
            <Link href="/friends" className="underline">
              Amis
            </Link>
            , tu peux lui envoyer un soin de ton armoire.
          </span>
        </p>
      </Card>

      <section className="space-y-3">
        <h2 className="font-display text-xl font-semibold text-cream-50">Boutique</h2>
        {!stripeEnabled ? (
          <Alert tone="warning" title="Boutique désactivée">
            Ajoute <code className="rounded-lg bg-ink-900 px-1.5 py-0.5 text-xs text-brass-300">STRIPE_SECRET_KEY</code> sur Vercel pour activer les achats (voir le README).
          </Alert>
        ) : testMode ? (
          <Alert tone="info">Mode test Stripe : aucun vrai paiement. Carte de test 4242 4242 4242 4242, date future, CVC quelconque.</Alert>
        ) : null}
        {stripeEnabled && webhookMissing ? (
          <Alert tone="warning">
            Sans <code className="rounded-lg bg-ink-900 px-1.5 py-0.5 text-xs text-brass-300">STRIPE_WEBHOOK_SECRET</code>, l&apos;achat n&apos;est crédité qu&apos;à ton retour sur cette page : ne la ferme pas avant.
          </Alert>
        ) : null}
        <ul className="space-y-2">
          {SHOP_ITEM_IDS.map((item) => {
            const product = SHOP_ITEMS[item];
            return (
              <li key={item} className="flex items-center gap-3 rounded-3xl border border-ink-600/80 bg-ink-800/90 p-4 shadow-card">
                <ItemIcon item={item} />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-cream-50">{product.label}</p>
                  <p className="text-xs text-cream-500">{product.description}</p>
                </div>
                <Button size="md" variant="brass" className="w-auto shrink-0 px-3" disabled={!stripeEnabled || pending !== null} onClick={() => buy(item)} aria-label={`Acheter ${product.label} pour ${formatPrice(product.priceCents)}`}>
                  <ShoppingBag className="h-4 w-4" aria-hidden="true" />
                  {formatPrice(product.priceCents)}
                </Button>
              </li>
            );
          })}
        </ul>
        <p className="flex items-center gap-1.5 text-xs text-cream-700">
          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          Paiement sécurisé sur la page Stripe. MealMate ne voit jamais ta carte.
        </p>
      </section>

      {purchases.length > 0 ? (
        <Card>
          <CardTitle className="text-lg">Mes derniers achats</CardTitle>
          <ul className="mt-2 divide-y divide-ink-600/80 text-sm">
            {purchases.map((purchase) => (
              <li key={purchase.id} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0 truncate text-cream-100">
                  {SHOP_ITEMS[purchase.item].label}
                  <span className="text-cream-700"> · {new Date(purchase.createdAt).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</span>
                </span>
                <span className="shrink-0 text-cream-500">
                  {formatPrice(purchase.amountCents)} · {STATUS_LABELS[purchase.status] ?? purchase.status}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
