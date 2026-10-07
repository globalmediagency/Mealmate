"use client";

import { CircleDot, Shield, Swords } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardText, CardTitle } from "@/components/ui/card";
import { ARENA_MODE_LABELS } from "@/lib/arena/labels";
import type { ArenaListing, ArenaMode, ArenaSnapshot } from "@/lib/arena/service";
import { cn } from "@/lib/utils/cn";

export type FriendOption = { userId: string; username: string; creatureName: string | null; available: boolean };

export type ArenaListProps = {
  listing: ArenaListing;
  friends: FriendOption[];
  /** Why the user cannot open a match right now (null when they can). */
  blocked: string | null;
  maxPlayers: number;
  /** The game chosen on the hub (`/arena?mode=`): the selector then shows that game only, with a way back to the hub. */
  initialMode?: ArenaMode | null;
  /** Plays left today for the user's creature (every game counts), shown before the form. */
  playsLeft?: number | null;
};

const dateFormat = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

const MODES: Array<{ id: ArenaMode; label: string; help: string; icon: typeof Swords }> = [
  { id: "arena", label: ARENA_MODE_LABELS.arena, help: "Chacun pour soi : lance des œufs sur les créatures des autres.", icon: Swords },
  { id: "coop", label: ARENA_MODE_LABELS.coop, help: "Ensemble contre la malbouffe qui attaque toutes vos créatures.", icon: Shield },
  { id: "pingpong", label: ARENA_MODE_LABELS.pingpong, help: "En duel : renvoie la balle au bon moment.", icon: CircleDot },
];

/** How many friends a mode takes. */
const guestLimit = (mode: ArenaMode, maxPlayers: number): number => (mode === "pingpong" ? 1 : maxPlayers - 1);

function names(snapshot: ArenaSnapshot): string {
  return snapshot.players
    .filter((p) => p.status === "ready" || p.status === "invited")
    .map((p) => (p.mine ? "toi" : p.username))
    .join(", ");
}

/** The arena's front door: open a match with friends, answer invitations, resume or review matches (spec § 3.22). */
export function ArenaList({ listing, friends, blocked, maxPlayers, initialMode = null, playsLeft = null }: ArenaListProps) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [mode, setMode] = useState<ArenaMode>(initialMode ?? "arena");
  const chosen = initialMode ? MODES.find((m) => m.id === initialMode) ?? null : null;
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const available = friends.filter((f) => f.available);

  const limit = guestLimit(mode, maxPlayers);

  function toggle(userId: string) {
    setSelected((list) => (list.includes(userId) ? list.filter((id) => id !== userId) : list.length < limit ? [...list, userId] : list));
  }

  function pickMode(next: ArenaMode) {
    setMode(next);
    setSelected((list) => list.slice(0, guestLimit(next, maxPlayers)));
  }

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/arena", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ friendIds: selected, mode }) });
      const body = (await response.json().catch(() => null)) as ArenaSnapshot | { error: { message: string } } | null;
      if (!response.ok || !body || "error" in body) {
        setError(body && "error" in body ? body.error.message : "Impossible d'ouvrir la partie.");
        return;
      }
      router.push(`/arena/${body.match.id}`);
    } catch {
      setError("Impossible de joindre le serveur.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {listing.invitations.length > 0 ? (
        <Card className="border-brass-500/40" data-arena-invitations>
          <CardTitle>Invitations</CardTitle>
          <ul className="mt-2 divide-y divide-ink-600/80">
            {listing.invitations.map((s) => {
              const host = s.players.find((p) => p.isHost);
              return (
                <li key={s.match.id} className="flex min-h-11 items-center justify-between gap-3 py-2 text-sm">
                  <span className="text-cream-100">
                    <span className="font-semibold">{host?.username ?? "Un ami"}</span> t&apos;invite · {ARENA_MODE_LABELS[s.match.mode]} · {names(s)}
                  </span>
                  <Link href={`/arena/${s.match.id}`} className="shrink-0 rounded-full bg-brass-400 px-3 py-1.5 text-xs font-semibold text-ink-950 hover:bg-brass-300">
                    Voir
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      ) : null}

      {listing.open.length > 0 ? (
        <Card data-arena-open>
          <CardTitle>Partie en cours</CardTitle>
          <ul className="mt-2 divide-y divide-ink-600/80">
            {listing.open.map((s) => (
              <li key={s.match.id} className="flex min-h-11 items-center justify-between gap-3 py-2 text-sm">
                <span className="text-cream-100">
                  {ARENA_MODE_LABELS[s.match.mode]} · {s.match.status === "playing" ? "en cours" : "salle d'attente"} · {names(s)}
                </span>
                <Link href={`/arena/${s.match.id}`} className="shrink-0 rounded-full bg-sage-500 px-3 py-1.5 text-xs font-semibold text-ink-950 hover:bg-sage-400">
                  Reprendre
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card data-arena-create>
        <div className="flex items-center gap-2">
          {chosen ? <chosen.icon className="h-5 w-5 text-sage-300" aria-hidden="true" /> : <Swords className="h-5 w-5 text-sage-300" aria-hidden="true" />}
          <CardTitle>{chosen ? `${chosen.label} · nouvelle partie` : "Nouvelle partie"}</CardTitle>
        </div>
        <CardText className="mt-1">
          {chosen ? `${chosen.help} ` : ""}
          {mode === "pingpong" ? "Invite un ami dont la créature est vivante." : `Invite jusqu'à ${maxPlayers - 1} amis dont la créature est vivante.`} Chacun pose son marqueur sur la même table et cadre la table avec son
          téléphone.
        </CardText>
        {playsLeft !== null && !blocked ? (
          <p className="mt-2 text-xs text-cream-500" data-arena-plays-left={playsLeft}>
            {playsLeft} partie{playsLeft > 1 ? "s" : ""} restante{playsLeft > 1 ? "s" : ""} aujourd&apos;hui pour toi · une partie compte pour chaque joueur.
          </p>
        ) : null}
        {chosen ? (
          <p className="mt-2 text-xs text-cream-500">
            <Link href="/play/amis" className="font-semibold text-sage-300 underline" data-arena-change-mode>
              Changer de jeu
            </Link>
          </p>
        ) : null}
        <div className={cn("mt-3 grid grid-cols-2 gap-2", chosen && "hidden")} role="radiogroup" aria-label="Type de partie">
          {MODES.map(({ id, label, help, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={mode === id}
              onClick={() => pickMode(id)}
              data-arena-mode={id}
              className={cn("flex min-h-11 flex-col items-start gap-1 rounded-2xl border px-3 py-2 text-left transition-colors", mode === id ? "border-brass-400/70 bg-brass-400/10" : "border-ink-600/80 bg-ink-900/60 hover:border-ink-500")}
            >
              <span className="flex items-center gap-1.5 text-sm font-semibold text-cream-50">
                <Icon className="h-4 w-4 text-sage-300" aria-hidden="true" />
                {label}
              </span>
              <span className="text-xs leading-snug text-cream-500">{help}</span>
            </button>
          ))}
        </div>
        {blocked ? (
          <Alert tone="warning" className="mt-3">
            {blocked}
          </Alert>
        ) : available.length === 0 ? (
          <CardText className="mt-3">
            Aucun ami avec une créature vivante pour le moment.{" "}
            <Link href="/friends" className="font-semibold text-sage-300 underline">
              Ajouter des amis
            </Link>
          </CardText>
        ) : (
          <>
            <ul className="mt-3 space-y-1.5">
              {friends.map((f) => (
                <li key={f.userId}>
                  <label className={cn("flex min-h-11 items-center gap-3 rounded-2xl border px-3 text-sm", f.available ? "border-ink-600/80 bg-ink-900/60" : "border-ink-700/60 text-cream-600")}>
                    <input
                      type="checkbox"
                      className="h-5 w-5 accent-sage-400"
                      disabled={!f.available || busy || (!selected.includes(f.userId) && selected.length >= limit)}
                      checked={selected.includes(f.userId)}
                      onChange={() => toggle(f.userId)}
                    />
                    <span className="font-semibold">{f.username}</span>
                    <span className="text-cream-500">{f.available ? `· ${f.creatureName}` : "· pas de créature vivante"}</span>
                  </label>
                </li>
              ))}
            </ul>
            {error ? (
              <Alert tone="danger" className="mt-3">
                {error}
              </Alert>
            ) : null}
            <Button onClick={() => void create()} disabled={selected.length === 0 || busy} variant="brass" className="mt-3 w-auto px-6">
              {busy ? "Ouverture…" : `Inviter${selected.length > 0 ? ` (${selected.length})` : ""} · ${ARENA_MODE_LABELS[mode]}`}
            </Button>
          </>
        )}
      </Card>

      {listing.recent.length > 0 ? (
        <Card data-arena-recent>
          <CardTitle>Dernières parties</CardTitle>
          <ul className="mt-2 divide-y divide-ink-600/80">
            {listing.recent.map((s) => {
              const count = s.players.filter((p) => p.status === "ready" || p.status === "left").length;
              const rank = s.me?.rank ?? null;
              return (
                <li key={s.match.id} className="flex min-h-11 items-center justify-between gap-3 py-2 text-sm">
                  <span className="text-cream-100">
                    {s.match.finishedAt ? dateFormat.format(new Date(s.match.finishedAt)) : ""} · {ARENA_MODE_LABELS[s.match.mode]} ·{" "}
                    {s.match.mode === "coop"
                      ? s.match.coop?.result
                        ? `${s.match.coop.result.score} pts à ${count}`
                        : "sans bilan"
                      : s.match.mode === "pingpong"
                        ? s.match.pingpong?.result
                          ? `${s.me?.points ?? 0} – ${s.players.find((p) => !p.mine)?.points ?? 0} · ${rank === 1 ? (s.match.pingpong.result.winnerId ? "gagné" : "égalité") : "perdu"}`
                          : "sans bilan"
                        : `${rank === null ? "—" : rank === 1 ? "1er" : `${rank}e`} sur ${count}`}
                    {s.match.stakes.winnerId ? (s.match.stakes.winnerId === s.me?.userId ? " · mises remportées" : " · mises perdues") : ""}
                  </span>
                  <Link href={`/arena/${s.match.id}`} className="shrink-0 text-xs font-semibold text-sage-300 underline">
                    Détail
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
