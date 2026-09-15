import type { Metadata } from "next";
import { BottomNav } from "@/components/layout/bottom-nav";
import { ConfigMissingScreen } from "@/components/system/config-missing-screen";
import { SchemaOutdatedScreen } from "@/components/system/schema-outdated-screen";
import { requireViewer, safeGetSession } from "@/lib/auth/session";
import { countOwnerNotices, countUnseenBoardings } from "@/lib/boarding/service";
import { countCoachingBadges } from "@/lib/coaching/service";
import { checkSchema } from "@/lib/db/schema-check";
import { countIncomingRequests } from "@/lib/friends/service";
import { countUnseenGifts } from "@/lib/shop/service";
import { countIncomingTrades } from "@/lib/trades/service";

export const dynamic = "force-dynamic";

/** Private, per-user pages: keep search engines out. */
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { configError } = await safeGetSession();
  if (configError) return <ConfigMissingScreen error={configError} />;
  // A migration not pasted in Neon yet would crash the first query: say which one instead.
  const { missing } = await checkSchema();
  if (missing.length > 0) return <SchemaOutdatedScreen missing={missing} />;
  const { session } = await requireViewer();
  const [pendingRequests, pendingTrades, unseenGifts, unseenBoardings, coaching, ownerNotices] = await Promise.all([
    countIncomingRequests(session.user.id).catch(() => 0),
    countIncomingTrades(session.user.id).catch(() => 0),
    countUnseenGifts(session.user.id).catch(() => 0),
    countUnseenBoardings(session.user.id).catch(() => 0),
    countCoachingBadges(session.user.id).catch(() => 0),
    countOwnerNotices(session.user.id).catch(() => 0),
  ]);

  return (
    <div className="min-h-dvh pb-nav">
      <a href="#main" className="skip-link">
        Aller au contenu
      </a>
      <main id="main" className="mx-auto w-full max-w-md px-4 pt-3 safe-top">{children}</main>
      <BottomNav badges={{ "/friends": pendingRequests + pendingTrades + coaching, "/home": unseenGifts + unseenBoardings + ownerNotices }} />
    </div>
  );
}
