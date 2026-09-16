"use client";

import { Swords, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { ArenaInviteNotice } from "@/lib/arena/service";
import { ARENA } from "@/lib/game/config";
import { cn } from "@/lib/utils/cn";

type LiveArenaState = {
  /** Pending invitations right now (server count until the first poll, then live). */
  invites: number;
};

const LiveArenaContext = createContext<LiveArenaState>({ invites: 0 });

/** The live invitation count, for the Amis badge. */
export function useLiveArena(): LiveArenaState {
  return useContext(LiveArenaContext);
}

const DISMISSED_KEY = "mealmate-arena-dismissed";
const MAX_BACKOFF_MS = 60_000;

function loadDismissed(): string[] {
  try {
    const raw = sessionStorage.getItem(DISMISSED_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function saveDismissed(ids: string[]) {
  try {
    sessionStorage.setItem(DISMISSED_KEY, JSON.stringify(ids.slice(-20)));
  } catch {
    // Private mode or storage full: the notice simply comes back on the next page load.
  }
}

/** A system notification when the app is in the background and the player allowed it (never prompts here). */
function notifyInBackground(notice: ArenaInviteNotice, open: () => void) {
  if (typeof document === "undefined" || !document.hidden) return;
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  try {
    const notification = new Notification("Bataille dans l'arène", {
      body: notice.mode === "coop" ? `${notice.hostName} t'invite à défendre vos créatures ensemble. Rejoins la partie avant qu'elle ne commence !` : `${notice.hostName} t'invite à une bataille d'œufs. Rejoins-la avant qu'elle ne commence !`,
      tag: `arena-${notice.matchId}`,
    });
    notification.onclick = () => {
      window.focus();
      open();
      notification.close();
    };
  } catch {
    // Some browsers refuse `new Notification` (iOS): the in-app notice is enough.
  }
}

function ago(iso: string, now: number): string {
  const seconds = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (seconds < 10) return "à l'instant";
  if (seconds < 60) return `il y a ${seconds} s`;
  const minutes = Math.round(seconds / 60);
  return `il y a ${minutes} min`;
}

export type ArenaInviteToastsProps = {
  notices: ArenaInviteNotice[];
  onDismiss: (matchId: string) => void;
  /** Clock for the "ago" labels (ms). */
  now?: number;
};

/** The invitation cards, stacked above the bottom navigation on every page. */
export function ArenaInviteToasts({ notices, onDismiss, now = Date.now() }: ArenaInviteToastsProps) {
  if (notices.length === 0) return null;
  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-50 flex flex-col items-center gap-2 px-4"
      style={{ bottom: "calc(4.75rem + env(safe-area-inset-bottom, 0px))" }}
      role="status"
      aria-live="polite"
      data-arena-invites={notices.length}
    >
      {notices.map((notice) => (
        <div key={notice.matchId} className="pointer-events-auto w-full max-w-md rounded-2xl border border-brass-500/50 bg-ink-900/95 p-3 shadow-card backdrop-blur animate-rise" data-arena-invite={notice.matchId}>
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brass-400/20 text-brass-300">
              <Swords className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-cream-50">
                <span className="font-semibold">{notice.hostName}</span> {notice.mode === "coop" ? "t'invite à défendre à deux" : "t'invite à une bataille dans l'arène"}
              </p>
              <p className="mt-0.5 text-xs text-cream-500">
                {notice.players.length > 0 ? `Avec ${notice.players.join(", ")} · ` : ""}
                {ago(notice.createdAt, now)}
              </p>
              <div className="mt-2 flex gap-2">
                <Link
                  href={`/arena/${notice.matchId}`}
                  onClick={() => onDismiss(notice.matchId)}
                  className="inline-flex min-h-11 items-center rounded-2xl bg-brass-400 px-4 text-sm font-semibold text-ink-950 hover:bg-brass-300"
                >
                  Voir la partie
                </Link>
                <button
                  type="button"
                  onClick={() => onDismiss(notice.matchId)}
                  className="inline-flex min-h-11 items-center rounded-2xl px-3 text-sm font-semibold text-cream-300 hover:text-cream-50"
                >
                  Plus tard
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onDismiss(notice.matchId)}
              aria-label="Fermer"
              className={cn("-mr-1 -mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-cream-500 hover:text-cream-50")}
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

export type LiveArenaProps = { initialInvites: number; children: ReactNode };

/**
 * Keeps the arena's invitations live on every page (spec § 3.22): the phone
 * asks `/api/arena/notices` every few seconds (slower in the background,
 * right away when the tab comes back), shows a card for each pending
 * invitation, feeds the Amis badge and refreshes the Arène page when a new
 * one arrives. "Plus tard" hides a card for the session; the badge stays.
 */
export function LiveArena({ initialInvites, children }: LiveArenaProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [notices, setNotices] = useState<ArenaInviteNotice[] | null>(null);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const known = useRef<Set<string> | null>(null);
  const failures = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef(false);
  const pathRef = useRef(pathname);
  pathRef.current = pathname;

  useEffect(() => setDismissed(loadDismissed()), []);

  const dismiss = useCallback((matchId: string) => {
    setDismissed((list) => {
      const next = list.includes(matchId) ? list : [...list, matchId];
      saveDismissed(next);
      return next;
    });
  }, []);

  useEffect(() => {
    let stopped = false;

    const schedule = (delay?: number) => {
      if (stopped) return;
      if (timer.current) clearTimeout(timer.current);
      const base = document.hidden ? ARENA.notices.hiddenPollMs : ARENA.notices.pollMs;
      timer.current = setTimeout(() => void poll(), delay ?? Math.min(MAX_BACKOFF_MS, base * 2 ** Math.min(4, failures.current)));
    };

    const poll = async () => {
      if (stopped || inFlight.current) return;
      inFlight.current = true;
      try {
        const response = await fetch("/api/arena/notices", { cache: "no-store" });
        if (!response.ok) throw new Error(`notices ${response.status}`);
        const body = (await response.json()) as { invites: ArenaInviteNotice[] };
        failures.current = 0;
        const invites = Array.isArray(body.invites) ? body.invites : [];
        setNotices(invites);
        setNow(Date.now());
        const ids = new Set(invites.map((i) => i.matchId));
        if (known.current) {
          const fresh = invites.filter((i) => !known.current!.has(i.matchId));
          if (fresh.length > 0) {
            if (pathRef.current === "/arena" || pathRef.current === "/friends") router.refresh();
            for (const notice of fresh) notifyInBackground(notice, () => router.push(`/arena/${notice.matchId}`));
          }
        }
        known.current = ids;
      } catch {
        failures.current += 1;
      } finally {
        inFlight.current = false;
        schedule();
      }
    };

    const wake = () => {
      if (!document.hidden) {
        failures.current = 0;
        schedule(0);
      }
    };
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("focus", wake);
    void poll();
    return () => {
      stopped = true;
      if (timer.current) clearTimeout(timer.current);
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("focus", wake);
    };
  }, [router]);

  const list = notices ?? [];
  const visible = list.filter((n) => !dismissed.includes(n.matchId) && !pathname.startsWith(`/arena/${n.matchId}`));
  return (
    <LiveArenaContext.Provider value={{ invites: notices ? notices.length : initialInvites }}>
      {children}
      <ArenaInviteToasts notices={visible} onDismiss={dismiss} now={now} />
    </LiveArenaContext.Provider>
  );
}

/** Dev screens: the card with sample data, dismissable. */
export function ArenaInvitePreview() {
  const [notices, setNotices] = useState<ArenaInviteNotice[]>(() => [
    { matchId: "00000000-0000-4000-8000-000000000042", hostId: "sam", hostName: "Sam", createdAt: new Date(Date.now() - 12_000).toISOString(), players: ["Léa", "Noé"], mode: "arena" },
    { matchId: "00000000-0000-4000-8000-000000000043", hostId: "noe", hostName: "Noé", createdAt: new Date(Date.now() - 40_000).toISOString(), players: [], mode: "coop" },
  ]);
  return <ArenaInviteToasts notices={notices} onDismiss={(id) => setNotices((list) => list.filter((n) => n.matchId !== id))} />;
}
