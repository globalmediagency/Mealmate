import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";

type ComingSoonProps = {
  icon: LucideIcon;
  title: string;
  description: string;
};

export function ComingSoon({ icon: Icon, title, description }: ComingSoonProps) {
  return (
    <Card className="flex flex-col items-center gap-4 py-10 text-center animate-rise">
      <span className="flex h-16 w-16 items-center justify-center rounded-full border border-sage-700/50 bg-sage-800/30 text-sage-300">
        <Icon className="h-7 w-7" aria-hidden="true" />
      </span>
      <div className="space-y-2">
        <h2 className="font-display text-2xl font-semibold text-cream-50">{title}</h2>
        <p className="mx-auto max-w-xs text-sm leading-relaxed text-cream-500">{description}</p>
      </div>
      <span className="rounded-full border border-brass-500/40 bg-brass-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-brass-300">
        Bientôt disponible
      </span>
    </Card>
  );
}
