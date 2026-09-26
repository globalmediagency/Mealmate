import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

export type BackLink = { href: string; label?: string };

type PageHeaderProps = {
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
  /** A 44 px chevron to the left of the title: the way back for pages that are not a tab of the bottom bar. */
  back?: BackLink;
  className?: string;
};

export function PageHeader({ title, subtitle, action, back, className }: PageHeaderProps) {
  return (
    <header className={cn("flex items-start justify-between gap-4 py-2", className)}>
      <div className="flex min-w-0 items-start gap-1">
        {back ? (
          <Link
            href={back.href}
            aria-label={back.label ?? "Retour"}
            title={back.label ?? "Retour"}
            className="-ml-2 mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-cream-300 hover:bg-ink-700 hover:text-cream-50"
            data-back
          >
            <ChevronLeft className="h-6 w-6" aria-hidden="true" />
          </Link>
        ) : null}
        <div className="min-w-0">
          <h1 className="font-display text-3xl font-semibold tracking-tight text-cream-50">{title}</h1>
          {subtitle ? <p className="mt-1 text-sm text-cream-500">{subtitle}</p> : null}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}
