import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FeedFlow } from "@/components/game/feed-flow";
import { ConfigBanner } from "@/components/system/config-banner";
import { requireViewer } from "@/lib/auth/session";
import { loadActiveCreatureView } from "@/lib/creatures/loader";
import { ConfigError, getConfigStatus } from "@/lib/env";
import { countMealsToday } from "@/lib/meals/service";

export const metadata: Metadata = { title: "Nourrir" };

export default async function FeedPage() {
  const { session } = await requireViewer();
  const creature = await loadActiveCreatureView(session.user.id);
  if (!creature || creature.status !== "alive" || !creature.name) redirect("/home");

  const status = getConfigStatus();
  const missing = [
    ...(status.r2 ? [] : ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"]),
    ...(status.gemini ? [] : ["GEMINI_API_KEY"]),
  ];
  const mealsToday = await countMealsToday(session.user.id);

  return (
    <div className="space-y-4">
      {missing.length > 0 ? <ConfigBanner error={new ConfigError(missing)} /> : null}
      <FeedFlow creature={creature} mealsToday={mealsToday} />
    </div>
  );
}
