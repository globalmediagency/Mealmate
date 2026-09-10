import type { Metadata } from "next";
import { FriendsPanel } from "@/components/game/friends-panel";
import { PageHeader } from "@/components/layout/page-header";
import { requireViewer } from "@/lib/auth/session";
import { listFriends, listRequests } from "@/lib/friends/service";
import { getInventory } from "@/lib/shop/service";
import { listTrades } from "@/lib/trades/service";

export const metadata: Metadata = { title: "Amis" };

export default async function FriendsPage() {
  const { session, profile } = await requireViewer();
  const [friends, requests, inventory, trades] = await Promise.all([
    listFriends(session.user.id),
    listRequests(session.user.id),
    getInventory(session.user.id),
    listTrades(session.user.id),
  ]);
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
      />
    </div>
  );
}
