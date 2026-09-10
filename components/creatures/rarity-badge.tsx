import { RARITY_LABELS, type Rarity } from "@/lib/game/config";
import { cn } from "@/lib/utils/cn";

const STYLES: Record<Rarity, string> = {
  commun: "border-cream-500/40 bg-cream-500/10 text-cream-300",
  rare: "border-mood/50 bg-mood/15 text-mood",
  tres_rare: "border-rarity-epic/60 bg-rarity-epic/15 text-rarity-epic",
  legendaire: "border-brass-400/70 bg-brass-500/20 text-brass-300 shadow-[0_0_18px_rgba(232,195,106,0.35)]",
};

export function RarityBadge({ rarity, className }: { rarity: Rarity; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider",
        STYLES[rarity],
        className,
      )}
    >
      {RARITY_LABELS[rarity]}
    </span>
  );
}

export const RARITY_COLORS: Record<Rarity, string> = {
  commun: "#9aa396",
  rare: "#7da7d9",
  tres_rare: "#b48ae0",
  legendaire: "#e8c36a",
};
