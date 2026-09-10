"use client";

import { Check, UserPlus, UserRoundX, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardText, CardTitle } from "@/components/ui/card";
import { CopyButton } from "@/components/ui/copy-button";
import { Input } from "@/components/ui/field";
import type { FriendRequestView, FriendView } from "@/lib/friends/service";
import type { Inventory } from "@/lib/shop/service";
import type { TradeableAccessories, TradesOverview } from "@/lib/trades/service";
import { HealFriend, TradeWithFriend, type Notify } from "./friend-actions";
import { FriendCard } from "./friend-card";
import { TradesList } from "./trades-list";

type FriendsPanelProps = {
  me: { username: string; friendCode: string };
  friends: FriendView[];
  incoming: FriendRequestView[];
  outgoing: FriendRequestView[];
  /** My medicine, to send to friends whose creature is tired or sick. */
  inventory: Inventory;
  trades: TradesOverview;
  /** Dev gallery only: pre-loaded trade dialog for the first friend. */
  demoTrade?: TradeableAccessories;
};

export function FriendsPanel({ me, friends, incoming, outgoing, inventory, trades, demoTrade }: FriendsPanelProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "danger" | "info"; text: string } | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const notify = useCallback<Notify>((tone, text) => {
    setMessage({ tone, text });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  async function call(id: string, url: string, method: "POST" | "DELETE", success: string) {
    setPending(id);
    setMessage(null);
    try {
      const response = await fetch(url, { method });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
        setMessage({ tone: "danger", text: body?.error?.message ?? "Action impossible." });
        return;
      }
      setMessage({ tone: "success", text: success });
      setConfirmRemove(null);
      router.refresh();
    } catch {
      setMessage({ tone: "danger", text: "Impossible de joindre le serveur." });
    } finally {
      setPending(null);
    }
  }

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = query.trim();
    if (trimmed.length < 2) return;
    setPending("add");
    setMessage(null);
    try {
      const response = await fetch("/api/friends", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: trimmed }),
      });
      const body = (await response.json().catch(() => null)) as
        | { status: "requested" | "accepted"; friend: { username: string } }
        | { error: { message: string } }
        | null;
      if (!response.ok || !body || "error" in body) {
        setMessage({ tone: "danger", text: body && "error" in body ? body.error.message : "Demande impossible." });
        return;
      }
      setQuery("");
      setMessage({
        tone: "success",
        text: body.status === "accepted" ? `${body.friend.username} et toi êtes maintenant amis !` : `Demande envoyée à ${body.friend.username}.`,
      });
      router.refresh();
    } catch {
      setMessage({ tone: "danger", text: "Impossible de joindre le serveur." });
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="space-y-5 animate-rise">
      <Card>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-cream-700">Mon code ami</p>
            <p className="font-mono text-xl font-semibold tracking-[0.18em] text-brass-300">{me.friendCode}</p>
            <p className="text-xs text-cream-500">ou mon pseudo : {me.username}</p>
          </div>
          <CopyButton value={me.friendCode} label="Copier mon code ami" />
        </div>
        <form onSubmit={add} className="mt-4 flex gap-2" noValidate>
          <Input
            aria-label="Code ami ou pseudo"
            placeholder="Code ami ou pseudo exact"
            autoCapitalize="none"
            autoComplete="off"
            spellCheck={false}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="min-h-12"
          />
          <Button type="submit" className="w-auto px-4" disabled={pending === "add" || query.trim().length < 2} aria-label="Envoyer une demande d'ami">
            <UserPlus className="h-5 w-5" aria-hidden="true" />
          </Button>
        </form>
        <CardText className="mt-2">Seuls tes amis acceptés voient ta créature. Aucun classement public.</CardText>
      </Card>

      {message ? <Alert tone={message.tone}>{message.text}</Alert> : null}

      {incoming.length > 0 ? (
        <section>
          <h2 className="mb-2 font-display text-xl font-semibold text-cream-50">Demandes reçues</h2>
          <ul className="space-y-2">
            {incoming.map((request) => (
              <li key={request.id} className="flex items-center justify-between gap-3 rounded-2xl border border-brass-500/40 bg-brass-500/10 px-4 py-3">
                <span className="truncate text-sm font-semibold text-cream-50">{request.user.username}</span>
                <span className="flex shrink-0 gap-2">
                  <Button size="md" className="w-auto px-3" disabled={pending === request.id} onClick={() => call(request.id, `/api/friends/${request.id}/accept`, "POST", `${request.user.username} est maintenant ton ami·e !`)} aria-label="Accepter">
                    <Check className="h-4 w-4" aria-hidden="true" />
                  </Button>
                  <Button size="md" variant="secondary" className="w-auto px-3" disabled={pending === request.id} onClick={() => call(request.id, `/api/friends/${request.id}`, "DELETE", "Demande refusée.")} aria-label="Refuser">
                    <X className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {outgoing.length > 0 ? (
        <section>
          <h2 className="mb-2 font-display text-xl font-semibold text-cream-50">Demandes envoyées</h2>
          <ul className="space-y-2">
            {outgoing.map((request) => (
              <li key={request.id} className="flex items-center justify-between gap-3 rounded-2xl border border-ink-600/80 bg-ink-800/80 px-4 py-3">
                <span className="truncate text-sm text-cream-300">{request.user.username} · en attente</span>
                <Button size="md" variant="ghost" className="w-auto px-3" disabled={pending === request.id} onClick={() => call(request.id, `/api/friends/${request.id}`, "DELETE", "Demande annulée.")}>
                  Annuler
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <TradesList trades={trades} notify={notify} />

      <section>
        <h2 className="mb-2 font-display text-xl font-semibold text-cream-50">
          Mes amis <span className="text-sm font-normal text-cream-500">({friends.length})</span>
        </h2>
        {friends.length === 0 ? (
          <Card className="text-center">
            <CardTitle className="text-lg">Personne pour l&apos;instant</CardTitle>
            <CardText className="mt-1">Partage ton code ami, ou entre celui d&apos;un proche ci-dessus.</CardText>
          </Card>
        ) : (
          <ul className="space-y-2">
            {friends.map((friend, index) => (
              <FriendCard
                key={friend.friendshipId}
                friend={friend}
                footer={
                  <div className="flex flex-col gap-2">
                    <HealFriend friend={friend} inventory={inventory} notify={notify} />
                    <TradeWithFriend friend={friend} notify={notify} initialData={index === 0 ? demoTrade : undefined} />
                  </div>
                }
              >
                {confirmRemove === friend.friendshipId ? (
                  <span className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      onClick={() => call(friend.friendshipId, `/api/friends/${friend.friendshipId}`, "DELETE", `${friend.user.username} a été retiré·e de tes amis.`)}
                      disabled={pending === friend.friendshipId}
                      className="min-h-11 rounded-xl border border-danger/50 bg-danger/15 px-2 text-xs font-semibold text-danger"
                    >
                      Retirer
                    </button>
                    <button type="button" onClick={() => setConfirmRemove(null)} className="min-h-11 rounded-xl border border-ink-500 px-2 text-xs text-cream-300">
                      Non
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmRemove(friend.friendshipId)}
                    aria-label={`Retirer ${friend.user.username} de mes amis`}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-cream-700 hover:bg-ink-700 hover:text-cream-100"
                  >
                    <UserRoundX className="h-4 w-4" aria-hidden="true" />
                  </button>
                )}
              </FriendCard>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
