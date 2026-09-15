"use client";

import { Check, Tent, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Creature } from "@/components/creatures/creature";
import { Alert } from "@/components/ui/alert";
import type { BoardingView, OwnerNoticeView } from "@/lib/boarding/service";
import { getSpecies } from "@/lib/creatures";
import type { CreatureView } from "@/lib/game/creature-view";
import { formatEndDate } from "./boarded-away";

type ApiError = { error?: { message?: string } };

/** Proposals a friend sent to the host: accept (the stay starts now) or decline. */
export type ProposalCard = { boarding: BoardingView; creature: CreatureView; ownerName: string };

export function BoardingProposals({ proposals }: { proposals: ProposalCard[] }) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [hidden, setHidden] = useState<string[]>([]);
  const shown = proposals.filter((p) => !hidden.includes(p.boarding.id));
  if (shown.length === 0 && !message) return null;

  async function respond(card: ProposalCard, accept: boolean) {
    setPending(card.boarding.id);
    setMessage(null);
    try {
      const response = await fetch(`/api/boardings/${card.boarding.id}/respond`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accept }) });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as ApiError | null;
        setMessage({ tone: "danger", text: body?.error?.message ?? "Impossible de répondre pour le moment." });
        return;
      }
      const name = card.creature.name ?? "la créature";
      setMessage({ tone: "success", text: accept ? `${name} est arrivée chez toi pour ${card.boarding.days} jour${card.boarding.days > 1 ? "s" : ""}. Tes repas et tes pas comptent aussi pour elle.` : `Tu as décliné : ${name} reste chez ${card.ownerName}.` });
      setHidden((h) => [...h, card.boarding.id]);
      router.refresh();
    } catch {
      setMessage({ tone: "danger", text: "Impossible de joindre le serveur." });
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="space-y-2">
      {message ? <Alert tone={message.tone}>{message.text}</Alert> : null}
      {shown.map((card) => {
        const species = card.creature.species ? getSpecies(card.creature.species.id) : undefined;
        return (
          <div key={card.boarding.id} role="status" className="rounded-2xl border border-brass-400/60 bg-ink-800/90 p-3 text-sm text-cream-100 animate-rise">
            <div className="flex items-center gap-3">
              <span className="flex h-16 w-16 shrink-0 items-end justify-center overflow-hidden rounded-xl bg-ink-900/70">
                {species ? <Creature species={species} stage={card.creature.stage.id} state={card.creature.state} size={64} /> : null}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  {card.ownerName} te propose de garder {card.creature.name} pendant {card.boarding.days} jour{card.boarding.days > 1 ? "s" : ""}
                </p>
                <p className="mt-0.5 text-xs text-cream-500">
                  Tes repas et tes pas compteraient aussi pour {card.creature.name} ; ses coffres seraient pour toi. Tu ne pourrais pas changer sa tenue.
                </p>
              </div>
              <span className="flex shrink-0 gap-1">
                <button type="button" onClick={() => respond(card, true)} disabled={pending !== null} aria-label={`Accepter de garder ${card.creature.name}`} className="flex h-11 w-11 items-center justify-center rounded-xl bg-sage-600 text-ink-950 hover:bg-sage-500">
                  <Check className="h-5 w-5" aria-hidden="true" />
                </button>
                <button type="button" onClick={() => respond(card, false)} disabled={pending !== null} aria-label={`Décliner la pension de ${card.creature.name}`} className="flex h-11 w-11 items-center justify-center rounded-xl border border-ink-500 text-cream-300 hover:bg-ink-700">
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** The owner's pending proposal (creature still home) and the host's answers, acknowledged on view. */
export function OwnerBoardingNotices({ proposal, notices }: { proposal: { boarding: BoardingView; host: string; creatureName: string } | null; notices: OwnerNoticeView[] }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  useEffect(() => {
    if (notices.length === 0) return;
    fetch("/api/boardings/seen", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role: "owner" }) }).catch(() => {
      // Best effort: the badge simply stays until the next visit.
    });
  }, [notices.length]);

  async function cancel() {
    if (!proposal) return;
    setPending(true);
    try {
      await fetch(`/api/boardings/${proposal.boarding.id}/end`, { method: "POST" });
      setCancelled(true);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-2">
      {notices.map((n) => (
        <Alert key={n.boarding.id} tone={n.kind === "accepted" ? "success" : "info"} title={n.kind === "accepted" ? `${n.host.username} a accepté !` : n.kind === "declined" ? `${n.host.username} a décliné` : `${n.host.username} t'a rendu ${n.creatureName ?? "ta créature"}`}>
          {n.kind === "accepted"
            ? `${n.creatureName ?? "Ta créature"} est en pension chez ${n.host.username} jusqu'au ${formatEndDate(n.boarding.endsAt)}. Tu peux la récupérer à tout moment.`
            : n.kind === "declined"
              ? `${n.creatureName ?? "Ta créature"} reste avec toi. Tu peux proposer à quelqu'un d'autre.`
              : `${n.creatureName ?? "Ta créature"} est de retour à la maison plus tôt que prévu.`}
        </Alert>
      ))}
      {proposal && !cancelled ? (
        <div role="status" className="flex items-start gap-3 rounded-2xl border border-sage-500/40 bg-sage-800/20 px-4 py-3 text-sm text-cream-100">
          <Tent className="mt-0.5 h-5 w-5 shrink-0 text-sage-300" aria-hidden="true" />
          <p className="min-w-0 flex-1">
            Proposition envoyée à <strong>{proposal.host}</strong> : garder {proposal.creatureName} pendant {proposal.boarding.days} jour{proposal.boarding.days > 1 ? "s" : ""}. En attendant sa réponse,{" "}
            {proposal.creatureName} reste avec toi.
          </p>
          <button type="button" onClick={cancel} disabled={pending} className="min-h-11 shrink-0 rounded-xl border border-ink-500 px-3 text-xs font-semibold text-cream-300 hover:bg-ink-700">
            Annuler
          </button>
        </div>
      ) : null}
    </div>
  );
}
