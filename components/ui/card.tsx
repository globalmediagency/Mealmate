import type { ComponentProps } from "react";
import { cn } from "@/lib/utils/cn";

export function Card({ className, ...props }: ComponentProps<"section">) {
  return (
    <section
      className={cn(
        "rounded-3xl border border-ink-600/80 bg-ink-800/90 p-5 shadow-card",
        className,
      )}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: ComponentProps<"h2">) {
  return (
    <h2
      className={cn("font-display text-xl font-semibold text-cream-50", className)}
      {...props}
    />
  );
}

export function CardText({ className, ...props }: ComponentProps<"p">) {
  return (
    <p className={cn("text-sm leading-relaxed text-cream-500", className)} {...props} />
  );
}
