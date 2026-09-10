import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils/cn";

type GaugeProps = {
  icon: LucideIcon;
  label: string;
  value: number;
  /** Tailwind background class of the bar, e.g. "bg-health". */
  barClass: string;
  caption?: string;
  className?: string;
};

export function Gauge({ icon: Icon, label, value, barClass, caption, className }: GaugeProps) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-ink-700 text-cream-300">
        <Icon className="h-4.5 w-4.5" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-baseline justify-between text-xs">
          <span className="font-medium text-cream-300">{label}</span>
          <span className="tabular-nums text-cream-500">
            {caption ?? `${pct} %`}
          </span>
        </div>
        <div
          role="meter"
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          className="h-2.5 overflow-hidden rounded-full bg-ink-600"
        >
          <div className={cn("h-full rounded-full transition-[width] duration-700", barClass)} style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  );
}
