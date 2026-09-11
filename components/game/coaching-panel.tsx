"use client";

import { Check, ChevronRight, GraduationCap, ThumbsDown, ThumbsUp, Trophy, UserRoundCheck, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardText, CardTitle } from "@/components/ui/card";
import type { CoachingRole, CoachingView, RewardStatus } from "@/lib/coaching/service";
import { cn } from "@/lib/utils/cn";
import { ChestOpener } from "./chest-reveal";

export type FriendOption = { friendshipId: string; username: string };

type Props = {
  me: { username: string };
  /** My coach (pending or active), null when none. */
  current: CoachingView | null;
  /** Coach answers / endings not seen yet. */
  notices: CoachingView[];
  /** Accepted friends I can ask (only used when `current` is null). */
  friends: FriendOption[];
  proposals: CoachingView[];
  students: CoachingView[];
  rewards: Record<CoachingRole, RewardStatus>;
};

type ApiError = { error?: { message?: string } };

async function readError(response: Response, fallback: string): Promise<string> {
  const body = (await response.json().catch(() => null)) as ApiError | null;
  return body?.error?.message ?? fallback;
}

const toChestStatus = (r: RewardStatus) => ({ totalSteps: r.points, earned: r.earned, opened: r.opened, available: r.available, stepsToNext: r.toNext, stepsPerChest: r.per });

function Counters({ view, className }: { view: CoachingView; className?: string }) {
  const net = view.thumbsUp - view.thumbsDown;
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1.5 text-xs", className)}>
      <span className="inline-flex items-center gap-1 rounded-full border border-health/50 bg-health/15 px-2 py-0.5 font-semibold text-health">
        <ThumbsUp className="h-3.5 w-3.5" aria-hidden="true" />
        {view.thumbsUp}
      </span>
      <span className="inline-flex items-center gap-1 rounded-full border border-danger/50 bg-danger/15 px-2 py-0.5 font-semibold text-danger">
        <ThumbsDown className="h-3.5 w-3.5" aria-hidden="true" />
        {view.thumbsDown}
      </span>
      <span className="text-cream-500">
        net {net >= 0 ? "+" : ""}
        {net}
      </span>
    </span>
  );
}

/** The Coaching page: my coach (or picking one), my rewards, and the people I coach. */
export function CoachingPanel({ me, current, notices, friends, proposals, students, rewards }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "danger" | "info"; text: string } | null>(null);
  const [confirmEnd, setConfirmEnd] = useState<string | null>(null);
  const [choice, setChoice] = useState<string>(friends[0]?.friendshipId ?? "");

  useEffect(() => {
    if (notices.length === 0) return;
    fetch("/api/coaching/seen", { method: "POST" }).catch(() => {
      // Best effort: the badge simply stays until the next visit.
    });
  }, [notices.length]);

  async function call(key: string, url: string, body: unknown, success: string) {
    setPending(key);
    setMessage(null);
    try {
      const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });
      if (!response.ok) {
        setMessage({ tone: "danger", text: await readError(response, "Action impossible pour le moment.") });
        return;
      }
      setMessage({ tone: "success", text: success });
      setConfirmEnd(null);
      router.refresh();
    } catch {
      setMessage({ tone: "danger", text: "Impossible de joindre le serveur." });
    } finally {
      setPending(null);
    }
  }

  const chosen = friends.find((f) => f.friendshipId === choice);

  return (
    <div className="space-y-5 animate-rise">
      {message ? <Alert tone={message.tone}>{message.text}</Alert> : null}
      {notices.map((n) => (
        <Alert key={n.id} tone={n.status === "active" ? "success" : "info"} title={n.status === "active" ? `${n.coach.username} a accepté d'être ton coach !` : n.status === "declined" ? `${n.coach.username} a décliné` : `${n.coach.username} a mis fin au coaching`}>
          {n.status === "active"
            ? `${n.coach.username} voit désormais tes repas et peut leur mettre un pouce vert ou rouge.`
            : n.status === "declined"
              ? "Pas de souci : tu peux proposer à quelqu'un d'autre."
              : `Tes pouces restent acquis : ${n.thumbsUp} vert${n.thumbsUp > 1 ? "s" : ""}, ${n.thumbsDown} rouge${n.thumbsDown > 1 ? "s" : ""}.`}
        </Alert>
      ))}

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 font-display text-xl font-semibold text-cream-50">
          <GraduationCap className="h-5 w-5 text-sage-300" aria-hidden="true" />
          Mon coach
        </h2>
        {current?.status === "active" ? (
          <Card>
            <CardTitle className="text-lg">{current.coach.username}</CardTitle>
            <CardText className="mt-1">
              {current.coach.username} voit tes repas des {" "}
              <strong className="text-cream-100">30 derniers jours</strong> et les note d&apos;un pouce. Tous les {rewards.student.per} pouces nets, une récompense surprise pour toi.
            </CardText>
            <Counters view={current} className="mt-3" />
            {confirmEnd === current.id ? (
              <div className="mt-3 flex gap-2">
                <Button size="md" variant="danger" className="w-auto px-4" onClick={() => call(current.id, `/api/coaching/${current.id}/end`, null, `Le coaching avec ${current.coach.username} est terminé.`)} disabled={pending !== null}>
                  Mettre fin
                </Button>
                <Button size="md" variant="ghost" className="w-auto px-4" onClick={() => setConfirmEnd(null)}>
                  Non
                </Button>
              </div>
            ) : (
              <button type="button" onClick={() => setConfirmEnd(current.id)} className="mt-3 block min-h-11 text-xs font-semibold text-cream-500 underline underline-offset-2 hover:text-cream-300">
                Mettre fin au coaching
              </button>
            )}
          </Card>
        ) : current?.status === "pending" ? (
          <Card>
            <CardTitle className="text-lg">Proposition envoyée à {current.coach.username}</CardTitle>
            <CardText className="mt-1">En attente de sa réponse. Tu seras prévenu·e ici.</CardText>
            <Button size="md" variant="ghost" className="mt-3 w-auto px-4" onClick={() => call(current.id, `/api/coaching/${current.id}/end`, null, "Proposition annulée.")} disabled={pending !== null}>
              Annuler la proposition
            </Button>
          </Card>
        ) : (
          <Card>
            <CardTitle className="text-lg">Choisir un coach parmi mes amis</CardTitle>
            <CardText className="mt-1">
              Ton coach verra tes repas (photos, heures et notes) pendant 30 jours et leur mettra un pouce vert ou rouge. Tous les {rewards.student.per} pouces nets, tu ouvres une récompense surprise.
            </CardText>
            {friends.length === 0 ? (
              <p className="mt-3 text-sm text-cream-500">
                Ajoute d&apos;abord un ami depuis l&apos;onglet{" "}
                <Link href="/friends" className="underline text-brass-200">
                  Amis
                </Link>
                .
              </p>
            ) : (
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <label className="flex-1 text-sm">
                  <span className="sr-only">Ami à proposer comme coach</span>
                  <select value={choice} onChange={(e) => setChoice(e.target.value)} className="w-full min-h-11 rounded-xl border border-ink-500 bg-ink-900/80 px-3 text-base text-cream-50 focus:border-sage-500 focus:outline-none focus:ring-2 focus:ring-sage-500/30">
                    {friends.map((f) => (
                      <option key={f.friendshipId} value={f.friendshipId}>
                        {f.username}
                      </option>
                    ))}
                  </select>
                </label>
                <Button size="md" className="w-auto px-4" onClick={() => call("propose", "/api/coaching", { friendshipId: choice }, `Proposition envoyée à ${chosen?.username ?? "ton ami"}.`)} disabled={!choice || pending !== null}>
                  <UserRoundCheck className="h-4 w-4" aria-hidden="true" />
                  Proposer comme coach
                </Button>
              </div>
            )}
          </Card>
        )}

        {rewards.student.available > 0 || rewards.student.points > 0 ? (
          <div className="space-y-1">
            <p className="text-xs text-cream-500">Récompenses d&apos;élève · {rewards.student.points} pouce{rewards.student.points > 1 ? "s" : ""} net{rewards.student.points > 1 ? "s" : ""} au total</p>
            <ChestOpener status={toChestStatus(rewards.student)} canEquip={false} mode="reward" endpoint="/api/coaching/rewards/open" body={{ role: "student" }} />
          </div>
        ) : null}
      </section>

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 font-display text-xl font-semibold text-cream-50">
          <Trophy className="h-5 w-5 text-brass-300" aria-hidden="true" />
          Je coache
        </h2>
        {proposals.length > 0 ? (
          <ul className="space-y-2">
            {proposals.map((p) => (
              <li key={p.id}>
                <Card className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <CardTitle className="text-base">{p.student.username} te propose d&apos;être son coach</CardTitle>
                    <CardText className="mt-0.5 text-xs">Tu verrais ses repas et leur mettrais un pouce. Tous les {rewards.coach.per} pouces donnés, une récompense pour toi.</CardText>
                  </div>
                  <span className="flex shrink-0 gap-1">
                    <button type="button" onClick={() => call(p.id, `/api/coaching/${p.id}/respond`, { accept: true }, `Tu es maintenant le coach de ${p.student.username}.`)} disabled={pending !== null} aria-label={`Accepter de coacher ${p.student.username}`} className="flex h-11 w-11 items-center justify-center rounded-xl bg-sage-600 text-ink-950 hover:bg-sage-500">
                      <Check className="h-5 w-5" aria-hidden="true" />
                    </button>
                    <button type="button" onClick={() => call(p.id, `/api/coaching/${p.id}/respond`, { accept: false }, "Proposition déclinée.")} disabled={pending !== null} aria-label={`Décliner la proposition de ${p.student.username}`} className="flex h-11 w-11 items-center justify-center rounded-xl border border-ink-500 text-cream-300 hover:bg-ink-700">
                      <X className="h-5 w-5" aria-hidden="true" />
                    </button>
                  </span>
                </Card>
              </li>
            ))}
          </ul>
        ) : null}
        {students.length === 0 && proposals.length === 0 ? (
          <Card>
            <CardText>Personne ne t&apos;a encore proposé d&apos;être son coach. Quand un ami le fera, sa demande apparaîtra ici.</CardText>
          </Card>
        ) : null}
        {students.length > 0 ? (
          <ul className="space-y-2">
            {students.map((s) => (
              <li key={s.id}>
                <Link href={`/coach/${s.id}`} className="flex min-h-16 items-center gap-3 rounded-3xl border border-ink-600/80 bg-ink-800/90 p-4 shadow-card transition-colors hover:border-sage-500/60">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-cream-50">{s.student.username}</p>
                    <Counters view={s} className="mt-1" />
                  </div>
                  <span className="shrink-0 text-xs text-sage-200">Voir ses repas</span>
                  <ChevronRight className="h-5 w-5 shrink-0 text-cream-700" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
        {rewards.coach.available > 0 || rewards.coach.points > 0 ? (
          <div className="space-y-1">
            <p className="text-xs text-cream-500">Récompenses de coach · {rewards.coach.points} pouce{rewards.coach.points > 1 ? "s" : ""} donné{rewards.coach.points > 1 ? "s" : ""} au total</p>
            <ChestOpener status={toChestStatus(rewards.coach)} canEquip={false} mode="reward" endpoint="/api/coaching/rewards/open" body={{ role: "coach" }} />
          </div>
        ) : null}
        <p className="text-xs text-cream-700">Connecté·e en tant que {me.username}.</p>
      </section>
    </div>
  );
}
