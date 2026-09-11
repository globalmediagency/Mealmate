import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FeedFlow } from "@/components/game/feed-flow";
import { ConfigBanner } from "@/components/system/config-banner";
import { requireViewer } from "@/lib/auth/session";
import { getHeldCreatures, livingHeld } from "@/lib/boarding/service";
import { ConfigError, getConfigStatus } from "@/lib/env";
import { toCreatureView } from "@/lib/game/creature-view";
import { getGameRules } from "@/lib/game/rules-service";
import { countMealsToday } from "@/lib/meals/service";

export const metadata: Metadata = { title: "Nourrir" };

/** Feeds every living creature in the user's care: their own (when home) and the ones boarded with them. */
export default async function FeedPage() {
  const { session } = await requireViewer();
  const now = new Date();
  const rules = await getGameRules();
  const living = livingHeld(await getHeldCreatures(session.user.id, now, rules));
  if (living.length === 0) redirect("/home");
  const creature = toCreatureView(living[0].creature, now, rules);
  if (!creature.name) redirect("/home");
  const others = living.slice(1).map((h) => h.creature.name ?? "une créature en pension");

  const status = getConfigStatus();
  const missing = [
    ...(status.r2 ? [] : ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"]),
    ...(status.gemini ? [] : ["GEMINI_API_KEY"]),
  ];
  const mealsToday = await countMealsToday(session.user.id);

  return (
    <div className="space-y-4">
      {missing.length > 0 ? <ConfigBanner error={new ConfigError(missing)} /> : null}
      <FeedFlow creature={creature} mealsToday={mealsToday} others={others} />
    </div>
  );
}
