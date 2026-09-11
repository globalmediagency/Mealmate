import type { Metadata } from "next";
import { FriendsPanel } from "@/components/game/friends-panel";
import { PageHeader } from "@/components/layout/page-header";
import { requireViewer } from "@/lib/auth/session";
import { boardingCooldownUntil, boardingLimits, getHeldCreatures } from "@/lib/boarding/service";
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
  const [friends, requests, inventory, trades, held, cooldown] = await Promise.all([
    listFriends(session.user.id),
    listRequests(session.user.id),
    getInventory(session.user.id),
    listTrades(session.user.id),
    getHeldCreatures(session.user.id, now, rules),
    boardingCooldownUntil(session.user.id, now, rules),
  ]);
  const own = held.own;
  const boardable = own && own.status === "alive" && own.name && !held.away && rules.boarding.maxPerHost > 0 ? { creatureName: own.name, ...boardingLimits(own.tier as Tier, rules) } : null;
  return (
    <div className="space-y-5">
      <PageHeader title="Amis" subtitle="Découvre les créatures de tes proches." />
      <FriendsPanel
        me={{ username: profile.username, friendCode: profile.friendCode }}
        friends={friends}
        incoming={requests.incoming}
        outgoing={requests.outgoing}
        inventory={inventory}
        trades={trades}
        boardable={boardable}
        cooldownUntil={cooldown?.toISOString() ?? null}
      />
    </div>
  );
}
