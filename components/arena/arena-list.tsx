"use client";

import { Swords } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardText, CardTitle } from "@/components/ui/card";
import type { ArenaListing, ArenaSnapshot } from "@/lib/arena/service";
import { cn } from "@/lib/utils/cn";

export type FriendOption = { userId: string; username: string; creatureName: string | null; available: boolean };

export type ArenaListProps = {
  listing: ArenaListing;
  friends: FriendOption[];
  /** Why the user cannot open a match right now (null when they can). */
  blocked: string | null;
  maxPlayers: number;
};

const dateFormat = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

function names(snapshot: ArenaSnapshot): string {
  return snapshot.players
    .filter((p) => p.status === "ready" || p.status === "invited")
    .map((p) => (p.mine ? "toi" : p.username))
    .join(", ");
}

/** The arena's front door: open a match with friends, answer invitations, resume or review matches (spec § 3.22). */
export function ArenaList({ listing, friends, blocked, maxPlayers }: ArenaListProps) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const available = friends.filter((f) => f.available);

  function toggle(userId: string) {
    setSelected((list) => (list.includes(userId) ? list.filter((id) => id !== userId) : list.length < maxPlayers - 1 ? [...list, userId] : list));
  }

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/arena", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ friendIds: selected }) });
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
                    <span className="font-semibold">{host?.username ?? "Un ami"}</span> t&apos;invite · {names(s)}
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
                  {s.match.status === "playing" ? "Bataille en cours" : "Salle d'attente"} · {names(s)}
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
          <Swords className="h-5 w-5 text-sage-300" aria-hidden="true" />
          <CardTitle>Nouvelle bataille</CardTitle>
        </div>
        <CardText className="mt-1">
          Invite jusqu&apos;à {maxPlayers - 1} amis dont la créature est vivante. Chacun pose son marqueur sur la même table et cadre la table avec son téléphone.
        </CardText>
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
                      disabled={!f.available || busy}
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
              {busy ? "Ouverture…" : `Inviter${selected.length > 0 ? ` (${selected.length})` : ""} et ouvrir la partie`}
            </Button>
          </>
        )}
      </Card>

      {listing.recent.length > 0 ? (
        <Card data-arena-recent>
          <CardTitle>Dernières batailles</CardTitle>
          <ul className="mt-2 divide-y divide-ink-600/80">
            {listing.recent.map((s) => {
              const count = s.players.filter((p) => p.status === "ready" || p.status === "left").length;
              const rank = s.me?.rank ?? null;
              return (
                <li key={s.match.id} className="flex min-h-11 items-center justify-between gap-3 py-2 text-sm">
                  <span className="text-cream-100">
                    {s.match.finishedAt ? dateFormat.format(new Date(s.match.finishedAt)) : ""} · {rank === null ? "—" : rank === 1 ? "1er" : `${rank}e`} sur {count}
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
