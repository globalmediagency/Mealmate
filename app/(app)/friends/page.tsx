import type { Metadata } from "next";
import { FriendsPanel } from "@/components/game/friends-panel";
import { SocialTabs } from "@/components/game/social-tabs";
import { PageHeader } from "@/components/layout/page-header";
import { requireViewer } from "@/lib/auth/session";
import { boardingCooldownUntil, boardingLimits, getHeldCreatures } from "@/lib/boarding/service";
import { countCoachingBadges } from "@/lib/coaching/service";
import type { Tier } from "@/lib/game/config";
import { getGameRules } from "@/lib/game/rules-service";
import { listFriends, listRequests } from "@/lib/friends/service";
import { getInventory } from "@/lib/shop/service";
import { listTrades } from "@/lib/trades/service";

export const metadata: Metadata = { title: "Amis" };

export default async function FriendsPage() {
  const { session, profile } = await requireViewer();
  const now = new Date();
  const rules = await getGameRules();
  const [friends, requests, inventory, trades, held, cooldown, coachingBadge] = await Promise.all([
    listFriends(session.user.id),
    listRequests(session.user.id),
    getInventory(session.user.id),
    listTrades(session.user.id),
    getHeldCreatures(session.user.id, now, rules),
    boardingCooldownUntil(session.user.id, now, rules),
    countCoachingBadges(session.user.id),
  ]);
  const own = held.own;
  const boardable = own && own.status === "alive" && own.name && !held.away && !held.proposal && rules.boarding.maxPerHost > 0 ? { creatureName: own.name, ...boardingLimits(own.tier as Tier, rules) } : null;
  const pendingWith = held.proposal ? { host: held.proposal.host.username, creatureName: own?.name ?? "ta créature", days: Math.round((held.proposal.endsAt.getTime() - held.proposal.startedAt.getTime()) / 86_400_000), boardingId: held.proposal.id } : null;
  return (
    <div className="space-y-5">
      <PageHeader title="Amis" subtitle="Découvre les créatures de tes proches." />
      <SocialTabs coachingBadge={coachingBadge} />
      <FriendsPanel
        me={{ username: profile.username, friendCode: profile.friendCode }}
        friends={friends}
        incoming={requests.incoming}
        outgoing={requests.outgoing}
        inventory={inventory}
        trades={trades}
        boardable={boardable}
        cooldownUntil={cooldown?.toISOString() ?? null}
        pendingBoarding={pendingWith}
      />
    </div>
  );
}
