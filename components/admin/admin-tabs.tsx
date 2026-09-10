"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";

const TABS = [
  { href: "/admin", label: "Règles de jeu" },
  { href: "/admin/creatures", label: "Créatures" },
  { href: "/admin/accessoires", label: "Accessoires" },
] as const;

/** Section tabs of the admin area (hidden on the login page). */
export function AdminTabs() {
  const pathname = usePathname();
  if (pathname.startsWith("/admin/login")) return null;
  return (
    <nav aria-label="Sections de l'administration" className="mx-auto flex w-full max-w-3xl gap-1 overflow-x-auto px-4 pb-2">
      {TABS.map((tab) => {
        const active = tab.href === "/admin" ? pathname === "/admin" : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex min-h-11 shrink-0 items-center rounded-xl px-4 text-sm font-semibold transition-colors",
              active ? "bg-sage-500/15 text-sage-200" : "text-cream-500 hover:bg-ink-700 hover:text-cream-100",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
