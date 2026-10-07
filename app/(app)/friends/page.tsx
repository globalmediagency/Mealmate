import type { Metadata } from "next";
import { Gamepad2 } from "lucide-react";
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

type SearchParams = Promise<{ from?: string }>;

export default async function FriendsPage({ searchParams }: { searchParams: SearchParams }) {
  const { session, profile } = await requireViewer();
  const { from } = await searchParams;
  // Sent here by the "Entre amis" door of the games hub, greyed while the player has no friend.
  const fromPlay = from === "play";
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
      {fromPlay ? (
        <p className="flex items-start gap-3 rounded-2xl border border-brass-500/50 bg-brass-500/10 px-4 py-3 text-sm text-cream-50" role="status" data-friends-play-notice>
          <Gamepad2 className="mt-0.5 h-5 w-5 shrink-0 text-brass-300" aria-hidden="true" />
          <span>
            <strong>Les jeux entre amis se jouent… entre amis !</strong>
            <span className="block text-cream-300">Partage ton code ami ou entre celui d&apos;un proche ci-dessous. Dès qu&apos;un ami est accepté, la porte « Entre amis » s&apos;ouvre dans « Jouer ».</span>
          </span>
        </p>
      ) : null}
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
