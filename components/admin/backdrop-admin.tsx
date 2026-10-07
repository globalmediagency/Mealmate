import type { ReactNode } from "react";
import { Backdrop } from "@/components/backdrops";
import { Creature } from "@/components/creatures/creature";
import { RarityBadge } from "@/components/creatures/rarity-badge";
import { BACKDROPS, CHEST_BACKDROPS, THEME_BACKDROPS, type Backdrop as BackdropEntry } from "@/lib/backdrops/catalog";
import type { BackdropStats } from "@/lib/backdrops/service";
import { speciesForTier } from "@/lib/creatures";
import { backdropWeight } from "@/lib/game/backdrops";
import { BACKDROP_DROPS, RARITIES, RARITY_LABELS, TIERS } from "@/lib/game/config";
import { formatPercent } from "@/lib/game/drops";
import { THEMES } from "@/lib/themes/catalog";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n > 1 ? many : one}`;

/** Admin « Fonds » (spec § 3.28): every scene drawn behind the creatures, its origin (design or chest), its chance and who shows it. Presentational: the page loads `stats`. */
export function BackdropAdmin({ stats }: { stats: BackdropStats }) {
  const model = speciesForTier("facile")[0];
  const chestPercent = Math.round(BACKDROP_DROPS.chestChance * 100);
  const counts = Object.fromEntries(RARITIES.map((r) => [r, CHEST_BACKDROPS.filter((b) => b.rarity === r).length]));
  const themeName = (b: BackdropEntry) => THEMES.find((t) => t.id === b.theme)?.name ?? b.theme;
  const byRarity = RARITIES.map((rarity) => ({ rarity, list: CHEST_BACKDROPS.filter((b) => b.rarity === rarity) })).filter((g) => g.list.length > 0);

  const card = (b: BackdropEntry, meta: ReactNode) => (
    <li key={b.id} className="overflow-hidden rounded-3xl border border-ink-600/80 bg-ink-800/80" data-admin-backdrop={b.id}>
      <div className="relative h-44 w-full">
        <div className="absolute inset-0">
          <Backdrop id={b.id} tier="facile" />
        </div>
        {model ? (
          <div className="absolute inset-x-0 bottom-0 flex justify-center">
            <Creature species={model} stage="adulte" state="healthy" size={120} animated={false} />
          </div>
        ) : null}
      </div>
      <div className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-cream-50">{b.name}</span>
          <RarityBadge rarity={b.rarity} className="text-[10px]" />
          {b.theme ? <span className="rounded-full border border-sage-500/50 bg-sage-800/40 px-2 py-0.5 text-[10px] font-semibold text-sage-200">design {themeName(b)}</span> : null}
          <code className="text-xs text-cream-700">{b.id}</code>
        </div>
        <p className="text-sm text-cream-500">{b.tagline}</p>
        <p className="mt-1 text-xs tabular-nums text-cream-700">{meta}</p>
        <div className="mt-2 flex gap-1">
          {TIERS.map((tier) => (
            <figure key={tier} className="flex-1">
              <div className="h-12 overflow-hidden rounded-xl">
                <Backdrop id={b.id} tier={tier} />
              </div>
              <figcaption className="mt-0.5 text-center text-[10px] text-cream-700">{tier}</figcaption>
            </figure>
          ))}
        </div>
      </div>
    </li>
  );

  return (
    <div className="space-y-6 animate-rise">
      <div>
        <h1 className="font-display text-3xl font-semibold text-cream-50">Fonds de scène</h1>
        <p className="mt-1 text-sm text-cream-500">
          {BACKDROPS.length} décors derrière la créature : {THEME_BACKDROPS.length} liés aux designs du site (toujours disponibles, celui du design en vigueur
          s&apos;affiche par défaut) et {CHEST_BACKDROPS.length} à trouver dans les coffres de pas ({RARITIES.filter((r) => counts[r] > 0).map((r) => `${counts[r]} ${RARITY_LABELS[r].toLowerCase()}`).join(" · ")}).
          Un coffre a {chestPercent} % de chances de contenir un décor que le joueur n&apos;a pas encore, réparti par rareté comme les accessoires ; jamais deux fois le même,
          et plus aucun une fois les {CHEST_BACKDROPS.length} trouvés. Le joueur choisit le décor de sa créature dans « Habiller » → Fond.
        </p>
        <p className="mt-2 text-xs tabular-nums text-cream-700" data-backdrop-stats>
          Créatures vivantes qui suivent le design : {stats.followingDesign} · avec un décor choisi : {Object.values(stats.inUse).reduce((a, b) => a + b, 0)}.
        </p>
      </div>

      <section>
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="font-display text-2xl text-cream-50">Décors des designs</h2>
          <span className="text-xs text-cream-500">{plural(THEME_BACKDROPS.length, "décor")}</span>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2">
          {THEME_BACKDROPS.map((b) => card(b, <>Toujours disponible · choisi par {plural(stats.inUse[b.id] ?? 0, "créature")} (sans compter celles qui suivent le design {themeName(b)}).</>))}
        </ul>
      </section>

      {byRarity.map(({ rarity, list }) => (
        <section key={rarity}>
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="font-display text-2xl text-cream-50">Décors de coffre · {RARITY_LABELS[rarity]}</h2>
            <span className="text-xs text-cream-500">{plural(list.length, "décor")}</span>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {list.map((b) =>
              card(
                b,
                <>
                  Chance par coffre (tant qu&apos;aucun décor n&apos;est trouvé) : {formatPercent(backdropWeight(b) * BACKDROP_DROPS.chestChance)} · trouvé par{" "}
                  {plural(stats.found[b.id] ?? 0, "joueur")} · choisi par {plural(stats.inUse[b.id] ?? 0, "créature")}.
                </>,
              ),
            )}
          </ul>
        </section>
      ))}
    </div>
  );
}
