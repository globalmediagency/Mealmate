import type { Metadata } from "next";
import { LiveArena } from "@/components/arena/live-arena";
import { BottomNav } from "@/components/layout/bottom-nav";
import { ConfigMissingScreen } from "@/components/system/config-missing-screen";
import { ThemeProvider } from "@/components/theme/theme-context";
import { ThemeSync } from "@/components/theme/theme-sync";
import { SchemaOutdatedScreen } from "@/components/system/schema-outdated-screen";
import { requireViewer, safeGetSession } from "@/lib/auth/session";
import { countArenaInvites } from "@/lib/arena/service";
import { countOwnerNotices, countUnseenBoardings } from "@/lib/boarding/service";
import { countCoachingBadges } from "@/lib/coaching/service";
import { checkSchema } from "@/lib/db/schema-check";
import { countIncomingRequests } from "@/lib/friends/service";
import { countUnseenGifts } from "@/lib/shop/service";
import { countIncomingTrades } from "@/lib/trades/service";
import { resolveTheme } from "@/lib/themes/catalog";
import { getThemeSettings } from "@/lib/themes/service";

export const dynamic = "force-dynamic";

/** Private, per-user pages: keep search engines out. */
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { configError } = await safeGetSession();
  if (configError) return <ConfigMissingScreen error={configError} />;
  // A migration not pasted in Neon yet would crash the first query: say which one instead.
  const { missing } = await checkSchema();
  if (missing.length > 0) return <SchemaOutdatedScreen missing={missing} />;
  const { session, profile } = await requireViewer();
  const [pendingRequests, pendingTrades, unseenGifts, unseenBoardings, coaching, ownerNotices, arenaInvites, themeSettings] = await Promise.all([
    countIncomingRequests(session.user.id).catch(() => 0),
    countIncomingTrades(session.user.id).catch(() => 0),
    countUnseenGifts(session.user.id).catch(() => 0),
    countUnseenBoardings(session.user.id).catch(() => 0),
    countCoachingBadges(session.user.id).catch(() => 0),
    countOwnerNotices(session.user.id).catch(() => 0),
    countArenaInvites(session.user.id).catch(() => 0),
    getThemeSettings(),
  ]);

  const theme = resolveTheme(profile.theme, themeSettings).id;
  return (
    <ThemeProvider theme={theme}>
    <div className="min-h-dvh pb-nav">
      {/* The design of the account (« Plus » → Apparence), applied over the device's cookie when they differ. */}
      <ThemeSync theme={theme} />
      <a href="#main" className="skip-link">
        Aller au contenu
      </a>
      {/* Arena invitations are live (polled by the phone) and reach every page: their count is added client-side to the Créature badge (the « Jouer » door). */}
      <LiveArena initialInvites={arenaInvites}>
        <main id="main" className="mx-auto w-full max-w-md px-4 safe-top">{children}</main>
        <BottomNav badges={{ "/friends": pendingRequests + pendingTrades + coaching, "/home": unseenGifts + unseenBoardings + ownerNotices }} />
      </LiveArena>
    </div>
    </ThemeProvider>
  );
}
