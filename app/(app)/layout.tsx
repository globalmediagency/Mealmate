import type { Metadata } from "next";
import { BottomNav } from "@/components/layout/bottom-nav";
import { ConfigMissingScreen } from "@/components/system/config-missing-screen";
import { requireViewer, safeGetSession } from "@/lib/auth/session";
import { countUnseenBoardings } from "@/lib/boarding/service";
import { countCoachingBadges } from "@/lib/coaching/service";
import { countIncomingRequests } from "@/lib/friends/service";
import { countUnseenGifts } from "@/lib/shop/service";
import { countIncomingTrades } from "@/lib/trades/service";

export const dynamic = "force-dynamic";

/** Private, per-user pages: keep search engines out. */
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { configError } = await safeGetSession();
  if (configError) return <ConfigMissingScreen error={configError} />;
  const { session } = await requireViewer();
  const [pendingRequests, pendingTrades, unseenGifts, unseenBoardings, coaching] = await Promise.all([
    countIncomingRequests(session.user.id).catch(() => 0),
    countIncomingTrades(session.user.id).catch(() => 0),
    countUnseenGifts(session.user.id).catch(() => 0),
    countUnseenBoardings(session.user.id).catch(() => 0),
    countCoachingBadges(session.user.id).catch(() => 0),
  ]);

  return (
    <div className="min-h-dvh pb-nav">
      <a href="#main" className="skip-link">
        Aller au contenu
      </a>
      <main id="main" className="mx-auto w-full max-w-md px-4 pt-3 safe-top">{children}</main>
      <BottomNav badges={{ "/friends": pendingRequests + pendingTrades + coaching, "/home": unseenGifts + unseenBoardings }} />
    </div>
  );
}
