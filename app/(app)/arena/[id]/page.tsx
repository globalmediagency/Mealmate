import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArenaMatch } from "@/components/arena/arena-match";
import { MarkerCard } from "@/components/ar/marker-card";
import { DomainError } from "@/lib/api/errors";
import { snapshot } from "@/lib/arena/service";
import { requireViewer } from "@/lib/auth/session";
import { getGameRules } from "@/lib/game/rules-service";

export const metadata: Metadata = { title: "Arène" };
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One match: lobby, battle and results, for its players only (spec § 3.22). */
export default async function ArenaMatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { session } = await requireViewer();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const rules = await getGameRules();
  let initial;
  try {
    initial = await snapshot(session.user.id, id, new Date(), rules);
  } catch (error) {
    if (error instanceof DomainError && error.code === "not_found") notFound();
    throw error;
  }
  const me = initial.me;
  return (
    <div className="space-y-5">
      <ArenaMatch initial={initial} webrtc={rules.arena.webrtc} />
      {me && initial.match.status !== "finished" && initial.match.status !== "cancelled" ? (
        <MarkerCard name={me.creatureName ?? "ta créature"} markerId={me.markerId} creatureId={me.creatureId} />
      ) : null}
    </div>
  );
}
