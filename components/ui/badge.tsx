import type { ComponentProps } from "react";
import { cn } from "@/lib/utils/cn";

export function Badge({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-ink-500 bg-ink-700 px-2.5 py-1 text-xs font-medium text-cream-300",
        className,
      )}
      {...props}
    />
  );
}
