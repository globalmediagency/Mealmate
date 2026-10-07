import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { FRIENDS_FOR_PLAY_HREF, GameList } from "@/components/game/play-hub";
import { requireViewer } from "@/lib/auth/session";
import { listFriends } from "@/lib/friends/service";
import { ARENA } from "@/lib/game/config";
import { getGameRules } from "@/lib/game/rules-service";
import { loadPlayCreature } from "@/lib/play/hub";
import { countPlaysToday } from "@/lib/play/service";

export const metadata: Metadata = { title: "Jeux entre amis" };
export const dynamic = "force-dynamic";

/**
 * The friends' door of the hub: Défendre ensemble, Arène and Ping-pong, with
 * the user's own creature only. Without any friend the player is sent to the
 * friends page (the hub greys the door for the same reason).
 */
export default async function PlayFriendsPage() {
  const { session } = await requireViewer();
  const now = new Date();
  const rules = await getGameRules();
  const play = await loadPlayCreature(session.user.id, undefined, now, rules);
  if (!play) redirect("/home");
  const { creature } = play;
  const [plays, friends] = await Promise.all([countPlaysToday(creature.id), listFriends(session.user.id, now).catch(() => [])]);
  if (friends.length === 0) redirect(FRIENDS_FOR_PLAY_HREF);
  return (
    <div className="space-y-4 animate-rise">
      <PageHeader title="Jeux entre amis" subtitle="Autour de la même table, chacun avec son marqueur." back={{ href: "/play", label: "Retour aux jeux" }} />
      <GameList
        kind="friends"
        creatureName={creature.name}
        playsLeft={Math.max(0, rules.play.maxPerDay - plays)}
        maxPerDay={rules.play.maxPerDay}
        friendsAvailable={friends.filter((f) => f.creature.status === "alive" && f.creature.name !== null).length}
        maxPlayers={ARENA.maxPlayers}
        pingpongPoints={rules.pingpong.pointsToWin}
      />
    </div>
  );
}
