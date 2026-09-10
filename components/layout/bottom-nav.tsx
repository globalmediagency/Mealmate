"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Egg, Ellipsis, Footprints, UtensilsCrossed, Users } from "lucide-react";
import { cn } from "@/lib/utils/cn";

const ITEMS = [
  { href: "/home", label: "Créature", icon: Egg },
  { href: "/meals", label: "Repas", icon: UtensilsCrossed },
  { href: "/activity", label: "Activité", icon: Footprints },
  { href: "/friends", label: "Amis", icon: Users },
  { href: "/more", label: "Plus", icon: Ellipsis },
] as const;

type BottomNavProps = { badges?: Partial<Record<string, number>> };

export function BottomNav({ badges = {} }: BottomNavProps) {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Navigation principale"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-600/80 bg-ink-900/85 backdrop-blur-xl safe-bottom"
    >
      <ul className="mx-auto flex w-full max-w-md items-stretch justify-between px-2">
        {ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          const badge = badges[href] ?? 0;
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-16 flex-col items-center justify-center gap-1 rounded-2xl text-[11px] font-medium transition-colors",
                  active ? "text-sage-400" : "text-cream-500 hover:text-cream-300",
                )}
              >
                <span
                  className={cn(
                    "relative flex h-8 w-12 items-center justify-center rounded-full transition-colors",
                    active && "bg-sage-500/15",
                  )}
                >
                  <Icon className="h-5 w-5" strokeWidth={active ? 2.4 : 2} aria-hidden="true" />
                  {badge > 0 ? (
                    <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brass-400 px-1 text-[10px] font-bold text-ink-950" aria-label={`${badge} notification${badge > 1 ? "s" : ""} en attente`}>
                      {badge}
                    </span>
                  ) : null}
                </span>
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
