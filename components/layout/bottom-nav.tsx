"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Egg, Ellipsis, Footprints, UtensilsCrossed, Users } from "lucide-react";
import { useLiveArena } from "@/components/arena/live-arena";
import { cn } from "@/lib/utils/cn";

const ITEMS = [
  { href: "/home", label: "Créature", icon: Egg },
  { href: "/meals", label: "Repas", icon: UtensilsCrossed },
  { href: "/activity", label: "Activité", icon: Footprints },
  { href: "/friends", label: "Amis", icon: Users },
  { href: "/more", label: "Plus", icon: Ellipsis },
] as const;

/** Every page outside the five tabs lights its parent tab, so the player always knows where they are. */
const PARENT: Record<string, string> = {
  "/feed": "/home",
  "/play": "/home",
  "/defense": "/home",
  "/arena": "/home",
  "/ar": "/home",
  "/wardrobe": "/home",
  "/shop": "/home",
  "/pension": "/home",
  "/collection": "/home",
  "/cemetery": "/home",
  "/coach": "/friends",
  "/privacy": "/more",
  "/legal": "/more",
};

/** The tab a path belongs to (its own href for a tab, its parent's otherwise). */
export function tabFor(pathname: string): string | null {
  for (const item of ITEMS) if (pathname === item.href || pathname.startsWith(`${item.href}/`)) return item.href;
  for (const [prefix, tab] of Object.entries(PARENT)) if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return tab;
  return null;
}

type BottomNavProps = { badges?: Partial<Record<string, number>> };

export function BottomNav({ badges = {} }: BottomNavProps) {
  const pathname = usePathname();
  const live = useLiveArena();
  const current = tabFor(pathname);
  return (
    <nav
      aria-label="Navigation principale"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-600/80 bg-ink-900/85 backdrop-blur-xl safe-bottom"
    >
      <ul className="mx-auto flex w-full max-w-md items-stretch justify-between px-2">
        {ITEMS.map(({ href, label, icon: Icon }) => {
          const active = current === href;
          // Invitations to play live on the Créature tab: that is where the "Jouer" door (and the games hub) is.
          const badge = (badges[href] ?? 0) + (href === "/home" ? live.invites : 0);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-16 flex-col items-center justify-center gap-1 rounded-2xl text-xs font-medium transition-colors",
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
                    <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-brass-400 px-1 text-[11px] font-bold text-ink-950" aria-hidden="true">
                      {badge}
                    </span>
                  ) : null}
                </span>
                {label}
                {badge > 0 ? <span className="sr-only">, {badge} notification{badge > 1 ? "s" : ""} en attente</span> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
