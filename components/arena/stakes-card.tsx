"use client";

import { Check, Gem } from "lucide-react";
import { AccessoryIcon } from "@/components/accessories";
import { Button } from "@/components/ui/button";
import { Card, CardText, CardTitle } from "@/components/ui/card";
import type { ArenaSnapshot, ArenaStakeView } from "@/lib/arena/service";
import { RARITY_LABELS } from "@/lib/game/config";
import { cn } from "@/lib/utils/cn";

/** A small chip naming one staked accessory. */
function StakeChip({ stake, muted = false }: { stake: ArenaStakeView; muted?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border border-ink-600/80 bg-ink-900/70 py-0.5 pl-0.5 pr-2 text-xs text-cream-100", muted && "opacity-60")} title={RARITY_LABELS[stake.rarity]}>
      <AccessoryIcon id={stake.accessoryId} size={22} className="shrink-0" />
      {stake.name}
    </span>
  );
}

export type StakesCardProps = {
  snapshot: ArenaSnapshot;
  busy: boolean;
  onStake: (accessoryId: string, staked: boolean) => void;
  onAgree: () => void;
};

/**
 * The pot of a lobby (spec § 3.24): what each player bets, who validated it,
 * the reader's collection to pick from, and the validation button. Any change
 * to the pot asks everybody to validate again; the host cannot start before.
 */
export function StakesCard({ snapshot, busy, onStake, onAgree }: StakesCardProps) {
  const { match, players, me, collection } = snapshot;
  const ready = players.filter((p) => p.status === "ready");
  const mine = me?.status === "ready";
  const staked = new Set(me?.stakes.map((st) => st.accessoryId) ?? []);
  const { pot, agreed, waitingFor } = match.stakes;
  const others = waitingFor.filter((name) => name !== "toi");
  return (
    <Card data-arena-stakes data-pot={pot} data-agreed={agreed} data-mine-agreed={me?.agreed ?? false}>
      <div className="flex items-center gap-2">
        <Gem className="h-5 w-5 text-brass-300" aria-hidden="true" />
        <CardTitle>Mises</CardTitle>
        <span className="ml-auto rounded-full bg-ink-900/70 px-2.5 py-0.5 text-xs font-semibold text-cream-300">{pot === 0 ? "Aucune mise" : `${pot} accessoire${pot > 1 ? "s" : ""} en jeu`}</span>
      </div>
      <CardText className="mt-1">
        Chacun peut miser des accessoires de sa collection, ou rien du tout. Le premier de la bataille remporte toutes les mises ; à égalité, chacun récupère les siennes. Quitter la
        bataille en cours, c&apos;est perdre sa mise.
      </CardText>

      <ul className="mt-3 divide-y divide-ink-600/80" aria-label="Mises des joueurs">
        {ready.map((p) => (
          <li key={p.userId} className="flex min-h-11 flex-wrap items-center gap-2 py-2 text-sm" data-arena-stake-row={p.userId}>
            <span className="font-semibold text-cream-100">{p.mine ? "Toi" : p.username}</span>
            {p.stakes.length === 0 ? <span className="text-cream-500">· rien de misé</span> : p.stakes.map((st) => <StakeChip key={st.accessoryId} stake={st} />)}
            <span className={cn("ml-auto inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold", p.agreed ? "bg-sage-700/50 text-sage-100" : "bg-ink-700 text-cream-500")}>
              {p.agreed ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : null}
              {p.agreed ? "A validé" : "À valider"}
            </span>
          </li>
        ))}
      </ul>

      {mine ? (
        <>
          <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-cream-500">Ta collection</p>
          {collection === undefined ? (
            <CardText className="mt-1">Chargement de ta collection…</CardText>
          ) : collection.length === 0 ? (
            <CardText className="mt-1">Ta collection est vide : les coffres gagnés en marchant te donneront de quoi miser. Tu peux valider sans rien miser.</CardText>
          ) : (
            <ul className="mt-2 grid grid-cols-2 gap-2" aria-label="Accessoires que tu peux miser">
              {collection.map((item) => {
                const on = staked.has(item.accessoryId);
                return (
                  <li key={item.accessoryId}>
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={on}
                      disabled={busy}
                      onClick={() => onStake(item.accessoryId, !on)}
                      data-arena-stake={item.accessoryId}
                      className={cn(
                        "flex min-h-11 w-full items-center gap-2 rounded-2xl border px-2 py-1.5 text-left text-sm transition-colors disabled:opacity-60",
                        on ? "border-brass-400/70 bg-brass-400/10 text-cream-50" : "border-ink-600/80 bg-ink-900/60 text-cream-100 hover:border-ink-500",
                      )}
                    >
                      <AccessoryIcon id={item.accessoryId} size={32} className="shrink-0" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{item.name}</span>
                        <span className="block truncate text-[11px] text-cream-500">
                          {RARITY_LABELS[item.rarity]}
                          {item.qty > 1 ? ` · ×${item.qty}` : ""}
                          {item.equipped ? " · porté" : ""}
                        </span>
                      </span>
                      {on ? <Check className="h-4 w-4 shrink-0 text-brass-300" aria-hidden="true" /> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button onClick={onAgree} disabled={busy || me?.agreed} variant={me?.agreed ? "secondary" : "primary"} className="w-auto px-5" data-arena-agree>
              {me?.agreed ? "Mises validées" : pot === 0 ? "Valider : on joue sans mise" : "Valider les mises"}
            </Button>
            <span className="text-xs text-cream-500" aria-live="polite">
              {agreed ? "Tout le monde a validé." : me?.agreed ? (others.length > 0 ? `En attente de ${others.join(", ")}.` : "En attente des autres joueurs.") : "Valide quand la liste te convient : toute modification redemande l'accord de tous."}
            </span>
          </div>
        </>
      ) : null}
    </Card>
  );
}

/** Once the match is over: who took the pot, what the reader won or lost. */
export function StakesResult({ snapshot }: { snapshot: ArenaSnapshot }) {
  const { match, players, me } = snapshot;
  const { winnerId, pot } = match.stakes;
  if (!match.stakes.enabled || pot === 0) return null;
  const winner = winnerId ? players.find((p) => p.userId === winnerId) : null;
  const won = winnerId !== null && winnerId === me?.userId;
  const lost = winnerId !== null && !won && (me?.stakes.length ?? 0) > 0;
  const gains = winnerId ? players.filter((p) => p.userId !== winnerId).flatMap((p) => p.stakes) : [];
  return (
    <Card data-arena-stakes-result data-outcome={won ? "won" : lost ? "lost" : winnerId ? "none" : "tie"}>
      <div className="flex items-center gap-2">
        <Gem className="h-5 w-5 text-brass-300" aria-hidden="true" />
        <CardTitle>Mises</CardTitle>
      </div>
      {won ? (
        <>
          <CardText className="mt-1 text-cream-100">Tu remportes toutes les mises ! Elles sont déjà dans ta collection.</CardText>
          <div className="mt-2 flex flex-wrap gap-1.5">{gains.length > 0 ? gains.map((st, i) => <StakeChip key={`${st.accessoryId}-${i}`} stake={st} />) : <span className="text-xs text-cream-500">Les autres n&apos;avaient rien misé : tu gardes la tienne.</span>}</div>
        </>
      ) : winnerId ? (
        <>
          <CardText className="mt-1">{winner?.username ?? "Le gagnant"} remporte les mises.</CardText>
          {lost ? (
            <>
              <p className="mt-2 text-xs text-cream-500">Ce que tu as misé :</p>
              <div className="mt-1 flex flex-wrap gap-1.5">{me!.stakes.map((st) => <StakeChip key={st.accessoryId} stake={st} muted />)}</div>
              <CardText className="mt-2">Pas de regret : les coffres t&apos;en offriront d&apos;autres, et la revanche n&apos;attend que toi.</CardText>
            </>
          ) : (
            <CardText className="mt-1">Tu n&apos;avais rien misé.</CardText>
          )}
        </>
      ) : (
        <CardText className="mt-1">Égalité : chacun récupère ses mises.</CardText>
      )}
    </Card>
  );
}
