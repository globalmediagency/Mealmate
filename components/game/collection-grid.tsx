import { Creature } from "@/components/creatures/creature";
import { RARITY_COLORS } from "@/components/creatures/rarity-badge";
import { speciesForTier } from "@/lib/creatures";
import { RARITIES, RARITY_LABELS, SPECIES_PER_TIER, TIER_CONFIG, TIERS } from "@/lib/game/config";

/** 60 species by tier: obtained ones in colour, the others as silhouettes. */
export function CollectionGrid({ obtained }: { obtained: ReadonlySet<string> }) {
  return (
    <div className="space-y-6">
      <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
        {RARITIES.map((rarity) => (
          <li key={rarity} className="inline-flex items-center gap-1.5" style={{ color: RARITY_COLORS[rarity] }}>
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: RARITY_COLORS[rarity] }} />
            {RARITY_LABELS[rarity]}
          </li>
        ))}
      </ul>
      {TIERS.map((tier) => {
        const species = speciesForTier(tier);
        const got = species.filter((s) => obtained.has(s.id)).length;
        return (
          <section key={tier}>
            <div className="mb-2 flex items-baseline justify-between">
              <h2 className="font-display text-xl font-semibold text-cream-50">{TIER_CONFIG[tier].label}</h2>
              <span className="text-xs text-cream-500">
                {got} / {SPECIES_PER_TIER}
              </span>
            </div>
            <ul className="grid grid-cols-4 gap-2">
              {species.map((s) => {
                const has = obtained.has(s.id);
                return (
                  <li
                    key={s.id}
                    className="flex flex-col items-center rounded-2xl bg-ink-800/80 p-1.5 text-center"
                    style={{ boxShadow: `inset 0 0 0 1px ${RARITY_COLORS[s.rarity]}${has ? "aa" : "44"}` }}
                  >
                    <Creature species={s} stage="adulte" size={64} animated={false} silhouette={!has} title={has ? s.name : "À découvrir"} />
                    <span className={has ? "text-[10px] font-semibold text-cream-100" : "text-[10px] text-cream-700"}>{has ? s.name : "?"}</span>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
