import type { Metadata } from "next";
import Link from "next/link";
import { DropRateEditor } from "@/components/admin/drop-rate-editor";
import { AccessoryIcon } from "@/components/accessories";
import { Creature } from "@/components/creatures/creature";
import { RarityBadge } from "@/components/creatures/rarity-badge";
import { requireAdmin } from "@/lib/admin/auth";
import { ACCESSORIES, accessoriesForSlot, SLOT_LABELS, SLOTS } from "@/lib/accessories/catalog";
import { speciesForTier } from "@/lib/creatures";
import { RARITIES, RARITY_LABELS, STAGES } from "@/lib/game/config";
import { accessoryWeights, formatChance } from "@/lib/game/drops";
import { getDropWeights } from "@/lib/game/drops-service";
import { cn } from "@/lib/utils/cn";

export const metadata: Metadata = { title: "Accessoires" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<{ slot?: string }>;
const isSlot = (v: string | undefined): v is (typeof SLOTS)[number] => (SLOTS as readonly string[]).includes(v ?? "");

export default async function AdminAccessoriesPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const { slot: slotParam } = await searchParams;
  const activeSlot = isSlot(slotParam) ? slotParam : undefined;
  const weighted = accessoryWeights((await getDropWeights()).accessories);
  const chanceOf = new Map(weighted.map((w) => [w.item.id, w]));
  const shownSlots = activeSlot ? [activeSlot] : SLOTS;
  const shownIds = new Set(ACCESSORIES.filter((a) => shownSlots.includes(a.slot)).map((a) => a.id));
  const hiddenWeight = weighted.filter((w) => !shownIds.has(w.item.id)).reduce((sum, w) => sum + w.weight, 0);
  // Reference model: the first common species of the easy tier, at every stage.
  const model = speciesForTier("facile")[0];
  const counts = Object.fromEntries(RARITIES.map((r) => [r, ACCESSORIES.filter((a) => a.rarity === r).length]));

  return (
    <div className="space-y-6 animate-rise">
      <div>
        <h1 className="font-display text-3xl font-semibold text-cream-50">Accessoires</h1>
        <p className="mt-1 text-sm text-cream-500">
          {ACCESSORIES.length} accessoires gagnés dans les coffres (un coffre tous les 5 000 pas), répartis en {SLOTS.length} emplacements.
          {" "}
          {RARITIES.map((r) => `${counts[r]} ${RARITY_LABELS[r].toLowerCase()}`).join(" · ")}.
        </p>
      </div>

      <nav aria-label="Filtrer par emplacement" className="flex flex-wrap gap-2">
        {[{ value: undefined, label: "Tous" }, ...SLOTS.map((s) => ({ value: s, label: SLOT_LABELS[s] }))].map((chip) => (
          <Link
            key={chip.label}
            href={chip.value ? `/admin/accessoires?slot=${chip.value}` : "/admin/accessoires"}
            aria-pressed={activeSlot === chip.value}
            className={cn(
              "inline-flex min-h-10 items-center rounded-full border px-3 text-xs font-semibold transition-colors",
              activeSlot === chip.value ? "border-sage-400/70 bg-sage-500/15 text-sage-200" : "border-ink-600 bg-ink-800 text-cream-300 hover:border-ink-400",
            )}
          >
            {chip.label}
            <span className="ml-1 font-normal text-cream-700">{chip.value ? accessoriesForSlot(chip.value).length : ACCESSORIES.length}</span>
          </Link>
        ))}
      </nav>

      <DropRateEditor
        key={activeSlot ?? "all"}
        kind="accessories"
        title={activeSlot ? `Probabilités des coffres · ${SLOT_LABELS[activeSlot]}` : "Probabilités des coffres · tous les accessoires"}
        rows={weighted
          .filter((w) => shownIds.has(w.item.id))
          .map((w) => ({ id: w.item.id, name: w.item.name, rarity: w.item.rarity, defaultWeight: w.defaultWeight, weight: w.weight, overridden: w.overridden }))}
        hiddenPoolWeight={hiddenWeight}
      />

      {shownSlots.map((slot) => {
        const list = accessoriesForSlot(slot).sort((a, b) => RARITIES.indexOf(a.rarity) - RARITIES.indexOf(b.rarity) || a.name.localeCompare(b.name, "fr"));
        return (
          <section key={slot}>
            <div className="mb-2 flex items-baseline justify-between">
              <h2 className="font-display text-2xl text-cream-50">{SLOT_LABELS[slot]}</h2>
              <span className="text-xs text-cream-500">{list.length} accessoire{list.length > 1 ? "s" : ""}</span>
            </div>
            <ul className="space-y-2">
              {list.map((a) => (
                <li key={a.id} className="rounded-3xl border border-ink-600/80 bg-ink-800/80 p-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-ink-900/70">
                      <AccessoryIcon id={a.id} size={56} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-cream-50">{a.name}</span>
                        <RarityBadge rarity={a.rarity} className="text-[10px]" />
                        <code className="text-xs text-cream-700">{a.id}</code>
                      </div>
                      <p className="text-sm text-cream-500">{a.tagline}</p>
                      <p className="text-xs tabular-nums text-cream-700">Chance par coffre : {chanceOf.get(a.id) ? formatChance(chanceOf.get(a.id)!) : "—"}</p>
                    </div>
                  </div>
                  {model ? (
                    <div className="mt-2 flex items-end gap-1 overflow-x-auto">
                      {STAGES.map((stage) => (
                        <figure key={stage.id} className="flex shrink-0 flex-col items-center">
                          <Creature species={model} stage={stage.id} state="healthy" size={84} animated={false} accessories={[{ slot, id: a.id }]} />
                          <figcaption className="text-[10px] text-cream-700">{stage.label}</figcaption>
                        </figure>
                      ))}
                      <p className="ml-2 text-xs text-cream-700">Porté par {model.name} à chaque stade.</p>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
