import type { Metadata } from "next";
import { BackdropAdmin } from "@/components/admin/backdrop-admin";
import { ConfigBanner } from "@/components/system/config-banner";
import { requireAdmin } from "@/lib/admin/auth";
import { countBackdropStats } from "@/lib/backdrops/service";
import { isConfigError } from "@/lib/env";

export const metadata: Metadata = { title: "Fonds de scène" };
export const dynamic = "force-dynamic";

/** Admin « Fonds »: the scenes behind the creatures (catalogue, chances, who found and shows what). */
export default async function AdminBackdropsPage() {
  await requireAdmin();
  try {
    return <BackdropAdmin stats={await countBackdropStats()} />;
  } catch (error) {
    if (isConfigError(error)) return <ConfigBanner error={error} />;
    throw error;
  }
}
