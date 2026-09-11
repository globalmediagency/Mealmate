import { ThumbsDown, ThumbsUp } from "lucide-react";
import type { MealThumb } from "@/lib/meals/service";
import { cn } from "@/lib/utils/cn";

/** The coach's thumb on a meal: green up, red down. */
export function ThumbBadge({ verdict, className }: { verdict: MealThumb; className?: string }) {
  const up = verdict === "up";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold",
        up ? "border-health/50 bg-health/15 text-health" : "border-danger/50 bg-danger/15 text-danger",
        className,
      )}
    >
      {up ? <ThumbsUp className="h-3.5 w-3.5" aria-hidden="true" /> : <ThumbsDown className="h-3.5 w-3.5" aria-hidden="true" />}
      {up ? "Pouce vert du coach" : "Pouce rouge du coach"}
    </span>
  );
}
