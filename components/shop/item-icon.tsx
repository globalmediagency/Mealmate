import { Droplets, Pill, Shield } from "lucide-react";
import type { ShopItemId } from "@/lib/game/config";
import { cn } from "@/lib/utils/cn";

export const ITEM_STYLE: Record<ShopItemId, { icon: typeof Pill; className: string }> = {
  sirop: { icon: Droplets, className: "bg-health/15 text-health" },
  antibiotique: { icon: Pill, className: "bg-mood/15 text-mood" },
  talisman: { icon: Shield, className: "bg-brass-500/20 text-brass-300" },
};

const SIZES = { sm: "h-8 w-8 rounded-xl [&>svg]:h-4 [&>svg]:w-4", md: "h-11 w-11 rounded-2xl [&>svg]:h-5 [&>svg]:w-5", lg: "h-14 w-14 rounded-2xl [&>svg]:h-7 [&>svg]:w-7" } as const;

/** Coloured tile with the icon of a shop item (decorative). */
export function ItemIcon({ item, size = "md", className }: { item: ShopItemId; size?: keyof typeof SIZES; className?: string }) {
  const { icon: Icon, className: tone } = ITEM_STYLE[item];
  return (
    <span className={cn("inline-flex shrink-0 items-center justify-center", SIZES[size], tone, className)} aria-hidden="true">
      <Icon />
    </span>
  );
}
