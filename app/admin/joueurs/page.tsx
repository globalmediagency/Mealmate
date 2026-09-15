import type { Metadata } from "next";
import { Search } from "lucide-react";
import { PlayerCard } from "@/components/admin/player-card";
import { ConfigBanner } from "@/components/system/config-banner";
import { requireAdmin } from "@/lib/admin/auth";
import { listPlayers, matchesPlayer } from "@/lib/admin/players";
import { isConfigError } from "@/lib/env";

export const metadata: Metadata = { title: "Joueurs" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<{ q?: string }>;

/** Every player with their creature, its live stats and characteristics, and the printed marker. */
export default async function AdminPlayersPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const { q = "" } = await searchParams;
  try {
    const players = await listPlayers();
    const shown = players.filter((p) => matchesPlayer(p, q));
    return (
      <div className="space-y-6 animate-rise">
        <div>
          <h1 className="font-display text-3xl font-semibold text-cream-50">Joueurs</h1>
          <p className="mt-1 text-sm text-cream-500">
            {players.length} compte{players.length > 1 ? "s" : ""} avec un profil. Les statistiques des créatures sont calculées à l&apos;instant, sans rien modifier.
          </p>
        </div>

        <form method="get" className="flex gap-2" role="search">
          <label className="sr-only" htmlFor="q">
            Rechercher un joueur
          </label>
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={q}
            placeholder="Pseudo, email, code ami, créature…"
            className="min-h-11 w-full rounded-xl border border-ink-500 bg-ink-900 px-3 text-base text-cream-50 placeholder:text-cream-700"
          />
          <button type="submit" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-sage-500 px-4 text-sm font-semibold text-ink-950">
            <Search className="h-4 w-4" aria-hidden="true" />
            Chercher
          </button>
        </form>

        {shown.length === 0 ? <p className="text-sm text-cream-500">Aucun joueur ne correspond.</p> : null}
        <div className="space-y-4">
          {shown.map((player) => (
            <PlayerCard key={player.userId} player={player} />
          ))}
        </div>
      </div>
    );
  } catch (error) {
    if (isConfigError(error)) return <ConfigBanner error={error} />;
    throw error;
  }
}
