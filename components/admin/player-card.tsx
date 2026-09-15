import { FileDown, Heart, Smile, Utensils } from "lucide-react";
import { Creature } from "@/components/creatures/creature";
import { RarityBadge } from "@/components/creatures/rarity-badge";
import type { AdminPlayer } from "@/lib/admin/players";
import { getSpecies } from "@/lib/creatures";
import { cn } from "@/lib/utils/cn";

const STATE_LABELS = { healthy: "En forme", tired: "Fatiguée", sick: "Malade", dead: "Morte" } as const;
const STATE_CLASS = { healthy: "text-health", tired: "text-brass-300", sick: "text-hunger", dead: "text-cream-500" } as const;

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
const fmtDateTime = (iso: string) => new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** One player on the admin "Joueurs" tab: account, creature with live stats and characteristics, printed marker. */
export function PlayerCard({ player }: { player: AdminPlayer }) {
  const c = player.creature;
  const species = c?.speciesId ? getSpecies(c.speciesId) : undefined;
  return (
    <article className="rounded-3xl border border-ink-600/80 bg-ink-800/90 p-4 shadow-card">
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="font-display text-xl text-cream-50">{player.username}</h2>
        <p className="text-xs text-cream-700">
          <code className="rounded bg-ink-900 px-1.5 py-0.5 text-brass-300">{player.friendCode}</code> · {player.email} · inscrit·e le {fmtDate(player.createdAt)}
        </p>
      </header>

      <dl className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        {[
          ["Repas", player.counts.meals.toLocaleString("fr-FR")],
          ["Pas", player.counts.steps.toLocaleString("fr-FR")],
          ["Amis", player.counts.friends.toLocaleString("fr-FR")],
          ["Au cimetière", player.counts.deadCreatures.toLocaleString("fr-FR")],
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl bg-ink-900/60 px-3 py-2">
            <dt className="text-[10px] uppercase tracking-wider text-cream-700">{label}</dt>
            <dd className="font-display text-lg tabular-nums text-cream-50">{value}</dd>
          </div>
        ))}
      </dl>
      {player.awayAt || player.hosting > 0 ? (
        <p className="mt-2 text-xs text-sage-200">
          {player.awayAt ? `Créature en pension chez ${player.awayAt}. ` : ""}
          {player.hosting > 0 ? `Héberge ${player.hosting} créature${player.hosting > 1 ? "s" : ""}.` : ""}
        </p>
      ) : null}

      {c ? (
        <section className="mt-4 rounded-2xl border border-ink-600/60 bg-ink-900/50 p-3" aria-label={`Créature de ${player.username}`}>
          <div className="flex gap-3">
            <div className="shrink-0" style={{ width: 96, height: 96 }}>
              {species && c.status !== "egg" ? (
                <Creature species={species} stage={c.stage as "bebe"} state={c.state} accessories={[]} size={96} animated={false} />
              ) : (
                <div className="flex h-24 w-24 items-center justify-center rounded-2xl bg-ink-800 text-3xl" aria-hidden="true">
                  🥚
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-display text-lg text-cream-50">{c.name ?? (c.status === "egg" ? "Œuf" : "Sans nom")}</h3>
                {c.rarity ? <RarityBadge rarity={c.rarity} /> : null}
                <span className="rounded-full bg-ink-700 px-2 py-0.5 text-[11px] text-cream-300">{c.tierLabel}</span>
                {!player.creatureIsCurrent ? <span className="rounded-full bg-ink-700 px-2 py-0.5 text-[11px] text-cream-500">dernière créature</span> : null}
              </div>
              <p className="mt-0.5 text-xs text-cream-500">
                {c.speciesName ?? "Espèce à découvrir"}
                {c.tagline ? <span className="text-cream-700"> · {c.tagline}</span> : null}
              </p>
              <p className={cn("mt-1 text-xs font-semibold", STATE_CLASS[c.state])}>
                {c.status === "egg"
                  ? `Œuf : ${c.eggSteps.toLocaleString("fr-FR")} / ${c.hatchSteps.toLocaleString("fr-FR")} pas`
                  : c.status === "dead"
                    ? `Morte${c.diedAt ? ` le ${fmtDate(c.diedAt)}` : ""}${c.lifespanDays !== null ? ` après ${c.lifespanDays} j` : ""}${c.deathCause ? ` (${c.deathCause})` : ""}`
                    : `${STATE_LABELS[c.state]} · ${c.stageLabel} · ${c.ageDays} j`}
              </p>
            </div>
          </div>

          {c.status === "alive" ? (
            <>
              <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
                <Stat icon={<Heart className="h-3.5 w-3.5" aria-hidden="true" />} label="Santé" value={`${Math.round(c.health)} %`} />
                <Stat icon={<Utensils className="h-3.5 w-3.5" aria-hidden="true" />} label="Faim" value={`${Math.round(c.hunger)} %`} />
                <Stat icon={<Smile className="h-3.5 w-3.5" aria-hidden="true" />} label="Humeur" value={`${Math.round(c.mood)} %`} hint={c.moodLabel} />
              </dl>
              <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-cream-300 sm:grid-cols-3">
                <li>
                  XP : <strong className="text-cream-100">{c.xp}</strong>
                  {c.xpToNextStage !== null ? <span className="text-cream-700"> (encore {c.xpToNextStage})</span> : null}
                </li>
                <li>Éclosion : {c.hatchedAt ? fmtDate(c.hatchedAt) : "—"}</li>
                <li>Coffres ouverts : {c.accessoryDrops}</li>
                <li>Pas bonus coffres : {c.chestBonusSteps.toLocaleString("fr-FR")}</li>
                <li className={c.sickSince ? "text-hunger" : ""}>
                  {c.sickSince ? `Malade depuis le ${fmtDateTime(c.sickSince)}${c.daysUntilDeath !== null ? ` · ${c.daysUntilDeath} j avant la mort` : ""}` : "Pas malade"}
                </li>
                <li>{c.protectedUntil && new Date(c.protectedUntil) > new Date() ? `Talisman jusqu'au ${fmtDateTime(c.protectedUntil)}` : "Sans talisman"}</li>
              </ul>
              <p className="mt-2 text-xs text-cream-300">
                Accessoires portés : {c.accessories.length > 0 ? c.accessories.join(", ") : <span className="text-cream-700">aucun</span>}
              </p>
            </>
          ) : null}

          {c.status !== "egg" && c.name ? (
            <details className="mt-3 rounded-2xl border border-ink-600/60 bg-ink-800/80 p-3">
              <summary className="cursor-pointer text-sm font-semibold text-cream-100">
                Afficher le marqueur{c.arMarker !== null ? ` (n° ${c.arMarker})` : " (sera attribué à l'ouverture)"}
              </summary>
              <div className="mt-3 flex flex-wrap items-center gap-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/admin/marker?creature=${c.id}&format=svg`} alt={`Marqueur de ${c.name}`} width={160} height={160} loading="lazy" className="rounded-lg bg-white p-1" />
                <div className="space-y-2">
                  <p className="text-xs text-cream-500">Carré de 8 cm, nom imprimé dessous. Le joueur trouve le même dans son écran « Voir en vrai ».</p>
                  <a
                    href={`/api/admin/marker?creature=${c.id}&format=pdf`}
                    target="_blank"
                    rel="noopener"
                    className="inline-flex min-h-11 items-center gap-2 rounded-2xl bg-brass-400 px-4 text-sm font-semibold text-ink-950 hover:bg-brass-300"
                  >
                    <FileDown className="h-4 w-4" aria-hidden="true" />
                    Imprimer (PDF)
                  </a>
                </div>
              </div>
            </details>
          ) : null}
        </section>
      ) : (
        <p className="mt-4 text-sm text-cream-500">Pas encore de créature.</p>
      )}
    </article>
  );
}

function Stat({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl bg-ink-800/80 px-3 py-2">
      <dt className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-cream-700">
        {icon} {label}
      </dt>
      <dd className="font-display text-lg tabular-nums text-cream-50">{value}</dd>
      {hint ? <dd className="text-[11px] text-cream-500">{hint}</dd> : null}
    </div>
  );
}
