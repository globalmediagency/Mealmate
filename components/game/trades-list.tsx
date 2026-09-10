"use client";

import { ArrowRight, Check, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AccessoryIcon } from "@/components/accessories";
import type { TradeView, TradesOverview } from "@/lib/trades/service";
import type { Notify } from "./friend-actions";

const STATUS_LABELS: Record<TradeView["status"], string> = { pending: "En attente", accepted: "Accepté", declined: "Refusé", cancelled: "Annulé" };

/** Pending accessory swaps (both directions) and the last resolved ones. */
export function TradesList({ trades, notify }: { trades: TradesOverview; notify: Notify }) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  if (trades.incoming.length === 0 && trades.outgoing.length === 0 && trades.recent.length === 0) return null;

  async function act(trade: TradeView, action: "accept" | "withdraw") {
    setPending(trade.id);
    try {
      const response = await fetch(action === "accept" ? `/api/trades/${trade.id}/accept` : `/api/trades/${trade.id}`, { method: action === "accept" ? "POST" : "DELETE" });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
        notify("danger", body?.error?.message ?? "Action impossible.");
        router.refresh();
        return;
      }
      notify(
        "success",
        action === "accept"
          ? `Échange conclu : ${trade.offered.name} rejoint ta garde-robe !`
          : trade.direction === "incoming"
            ? "Proposition refusée."
            : "Proposition retirée.",
      );
      router.refresh();
    } catch {
      notify("danger", "Impossible de joindre le serveur.");
    } finally {
      setPending(null);
    }
  }

  return (
    <section>
      <h2 className="mb-2 font-display text-xl font-semibold text-cream-50">Trocs d&apos;accessoires</h2>
      <ul className="space-y-2">
        {trades.incoming.map((trade) => (
          <TradeRow key={trade.id} trade={trade} highlight>
            <button type="button" disabled={pending === trade.id} onClick={() => act(trade, "accept")} aria-label="Accepter l'échange" className="flex h-10 w-10 items-center justify-center rounded-xl bg-sage-500 text-ink-950 hover:bg-sage-400 disabled:opacity-50">
              <Check className="h-4 w-4" aria-hidden="true" />
            </button>
            <button type="button" disabled={pending === trade.id} onClick={() => act(trade, "withdraw")} aria-label="Refuser l'échange" className="flex h-10 w-10 items-center justify-center rounded-xl border border-ink-500 bg-ink-700 text-cream-100 hover:bg-ink-600 disabled:opacity-50">
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </TradeRow>
        ))}
        {trades.outgoing.map((trade) => (
          <TradeRow key={trade.id} trade={trade}>
            <button type="button" disabled={pending === trade.id} onClick={() => act(trade, "withdraw")} className="min-h-10 rounded-xl px-3 text-xs font-semibold text-cream-300 hover:bg-ink-700 disabled:opacity-50">
              Retirer
            </button>
          </TradeRow>
        ))}
        {trades.recent.map((trade) => (
          <TradeRow key={trade.id} trade={trade} muted>
            <span className="text-xs text-cream-500">{STATUS_LABELS[trade.status]}</span>
          </TradeRow>
        ))}
      </ul>
    </section>
  );
}

function TradeRow({ trade, highlight, muted, children }: { trade: TradeView; highlight?: boolean; muted?: boolean; children: React.ReactNode }) {
  // From my point of view: what I give and what I get.
  const give = trade.direction === "outgoing" ? trade.offered : trade.requested;
  const get = trade.direction === "outgoing" ? trade.requested : trade.offered;
  return (
    <li
      className={
        highlight
          ? "flex items-center gap-3 rounded-2xl border border-brass-500/40 bg-brass-500/10 px-3 py-2.5"
          : muted
            ? "flex items-center gap-3 rounded-2xl border border-ink-600/60 bg-ink-800/60 px-3 py-2.5 opacity-80"
            : "flex items-center gap-3 rounded-2xl border border-ink-600/80 bg-ink-800/80 px-3 py-2.5"
      }
    >
      <div className="flex shrink-0 items-center gap-1">
        <AccessoryIcon id={give.id} size={34} />
        <ArrowRight className="h-4 w-4 text-cream-700" aria-hidden="true" />
        <AccessoryIcon id={get.id} size={34} />
      </div>
      <div className="min-w-0 flex-1 text-xs">
        <p className="truncate font-semibold text-cream-50">
          {trade.direction === "incoming" ? `${trade.other.username} te propose` : `Proposé à ${trade.other.username}`}
        </p>
        <p className="text-cream-400">
          <strong className="text-cream-200">{give.name}</strong> contre <strong className="text-cream-200">{get.name}</strong>
        </p>
      </div>
      <span className="flex shrink-0 items-center gap-1.5">{children}</span>
    </li>
  );
}
