"use client";

import { Tent, Undo2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { FriendView } from "@/lib/friends/service";
import { cn } from "@/lib/utils/cn";
import type { Notify } from "./friend-actions";

type ApiError = { error: { message: string } };

async function readError(response: Response, fallback: string): Promise<string> {
  const body = (await response.json().catch(() => null)) as ApiError | null;
  return body?.error?.message ?? fallback;
}

/** "Confier en pension" on a friend card: the creature goes to live at the friend's for a few days (`durations` = choices allowed for its tier). */
export function BoardWithFriend({ friend, creatureName, durations, notify }: { friend: FriendView; creatureName: string; durations: number[]; notify: Notify }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState<number>(() => durations.find((d) => d >= 7) ?? durations[durations.length - 1] ?? 1);
  const [pending, setPending] = useState(false);

  async function confirm() {
    setPending(true);
    try {
      const response = await fetch(`/api/friends/${friend.friendshipId}/board`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ days }) });
      if (!response.ok) {
        notify("danger", await readError(response, "Pension impossible."));
        return;
      }
      notify("success", `${creatureName} est en pension chez ${friend.user.username} pour ${days} jour${days > 1 ? "s" : ""}. Tu peux la récupérer à tout moment depuis l'écran Créature.`);
      setOpen(false);
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
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-sage-500/50 bg-sage-800/40 px-3 text-xs font-semibold text-sage-200 transition-colors hover:bg-sage-800/70"
      >
        <Tent className="h-4 w-4" aria-hidden="true" />
        Confier en pension
      </button>
      {open ? (
        <div className="mt-2 rounded-2xl border border-ink-600/80 bg-ink-900/70 p-3 animate-rise">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-cream-300">
              Confier <strong className="text-cream-50">{creatureName}</strong> à <strong className="text-cream-50">{friend.user.username}</strong>
            </p>
            <button type="button" onClick={() => setOpen(false)} aria-label="Fermer" className="-m-1.5 flex h-11 w-11 items-center justify-center rounded-xl text-cream-500 hover:bg-ink-700">
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-cream-500">
            {friend.user.username} la nourrira avec ses repas, jouera avec elle et pourra la soigner. Elle part avec ses accessoires (impossible d&apos;y toucher) et les
            coffres qu&apos;elle gagne là-bas reviennent à {friend.user.username}. Elle continue de vivre normalement : elle peut tomber malade. Tu la récupères quand tu veux.
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Durée de la pension">
            {durations.map((d) => (
              <button
                key={d}
                type="button"
                role="radio"
                aria-checked={days === d}
                onClick={() => setDays(d)}
                className={cn("min-h-11 rounded-xl border px-3 text-sm font-semibold", days === d ? "border-sage-400/70 bg-sage-500/15 text-sage-200" : "border-ink-600 bg-ink-800 text-cream-300 hover:border-ink-400")}
              >
                {d} j
              </button>
            ))}
          </div>
          <Button size="md" className="mt-3" onClick={confirm} disabled={pending}>
            <Tent className="h-4 w-4" aria-hidden="true" />
            {pending ? "Un instant…" : `Confier ${creatureName} pour ${days} jour${days > 1 ? "s" : ""}`}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

type EndOutcome = { endReason: "recovered" | "returned" | "expired" | "died" | null; role: "owner" | "host"; other: { username: string }; creature: { name: string | null; status: string } };

/**
 * Ends a stay: the owner takes their creature back ("Récupérer…"), the host
 * sends it home ("Rendre…"). Refreshes the page afterwards; the owner lands on
 * the mourning screen if the creature died meanwhile.
 */
export function EndBoardingButton({ boardingId, label, variant = "brass", afterHref }: { boardingId: string; label: string; variant?: "brass" | "secondary"; afterHref?: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);

  async function end() {
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/boardings/${boardingId}/end`, { method: "POST" });
      if (!response.ok) {
        setMessage({ tone: "danger", text: await readError(response, "Impossible pour le moment.") });
        return;
      }
      const body = (await response.json()) as EndOutcome;
      const name = body.creature.name ?? "La créature";
      if (body.role === "owner") {
        setMessage({ tone: "success", text: body.creature.status === "dead" ? `${name} est revenue… mais elle n'a pas survécu à son séjour.` : `${name} est de retour à la maison !` });
      } else {
        setMessage({ tone: "success", text: `${name} est rentrée chez ${body.other.username}.` });
      }
      if (afterHref) router.push(afterHref);
      router.refresh();
    } catch {
      setMessage({ tone: "danger", text: "Impossible de joindre le serveur." });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-2">
      {message ? <Alert tone={message.tone}>{message.text}</Alert> : null}
      <Button variant={variant} onClick={end} disabled={pending}>
        <Undo2 className="h-5 w-5" aria-hidden="true" />
        {pending ? "Un instant…" : label}
      </Button>
    </div>
  );
}
