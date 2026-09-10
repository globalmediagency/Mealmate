import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { ShopPanel } from "@/components/shop/shop-panel";
import { requireViewer } from "@/lib/auth/session";
import { loadActiveCreatureView } from "@/lib/creatures/loader";
import { optionalEnv } from "@/lib/env";
import { isStripeTestMode } from "@/lib/payments/stripe";
import { getInventory, listPurchases } from "@/lib/shop/service";

export const metadata: Metadata = { title: "Boutique" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<{ success?: string; cancelled?: string; session_id?: string }>;

export default async function ShopPage({ searchParams }: { searchParams: SearchParams }) {
  const { session } = await requireViewer();
  const params = await searchParams;
  const [inventory, purchases, creature] = await Promise.all([
    getInventory(session.user.id),
    listPurchases(session.user.id),
    loadActiveCreatureView(session.user.id),
  ]);
  const secretKey = optionalEnv("STRIPE_SECRET_KEY");
  return (
    <div className="space-y-4">
      <PageHeader title="Boutique" subtitle="Des soins pour ta créature, et pour celles de tes amis." />
      <ShopPanel
        inventory={inventory}
        purchases={purchases}
        stripeEnabled={secretKey !== undefined}
        webhookMissing={optionalEnv("STRIPE_WEBHOOK_SECRET") === undefined}
        testMode={secretKey ? isStripeTestMode(secretKey) : false}
        creature={creature?.status === "alive" && creature.name ? { name: creature.name, health: creature.health } : null}
        checkout={{ success: params.success === "1", cancelled: params.cancelled === "1", sessionId: params.session_id ?? null }}
      />
    </div>
  );
}
