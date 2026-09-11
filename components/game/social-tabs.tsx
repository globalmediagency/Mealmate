"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";

/** "Amis" / "Coaching" switch at the top of both pages. */
export function SocialTabs({ coachingBadge = 0 }: { coachingBadge?: number }) {
  const pathname = usePathname();
  const tabs = [
    { href: "/friends", label: "Amis", badge: 0 },
    { href: "/coach", label: "Coaching", badge: coachingBadge },
  ];
  return (
    <nav aria-label="Amis et coaching" className="flex rounded-2xl border border-ink-600/80 bg-ink-800/80 p-1">
      {tabs.map((tab) => {
        const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-colors",
              active ? "bg-sage-800/60 text-sage-200" : "text-cream-500 hover:text-cream-300",
            )}
          >
            {tab.label}
            {tab.badge > 0 ? (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brass-400 px-1.5 text-[11px] font-bold text-ink-950">{tab.badge}</span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
