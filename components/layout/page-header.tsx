import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

type PageHeaderProps = {
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
  className?: string;
};

export function PageHeader({ title, subtitle, action, className }: PageHeaderProps) {
  return (
    <header className={cn("flex items-start justify-between gap-4 py-2", className)}>
      <div className="min-w-0">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-cream-50">
          {title}
        </h1>
        {subtitle ? <p className="mt-1 text-sm text-cream-500">{subtitle}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}
