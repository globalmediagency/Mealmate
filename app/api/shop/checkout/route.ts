import { z } from "zod";
import { requestOrigin } from "@/lib/api/origin";
import { fail, handleRouteError, ok } from "@/lib/api/respond";
import { getSession } from "@/lib/auth/session";
import { shopItemSchema } from "@/lib/shop/schemas";
import { createCheckout } from "@/lib/shop/service";
import { stripeProvider } from "@/lib/shop/stripe-provider";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ item: shopItemSchema });

/** POST /api/shop/checkout { item } → { url } (Stripe Checkout redirect). */
export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) return fail("unauthorized", "Connecte-toi pour continuer.", 401);
    const body = bodySchema.parse(await request.json().catch(() => ({})));
    const checkout = await createCheckout(session.user.id, body.item, requestOrigin(request), stripeProvider);
    return ok({ url: checkout.url });
  } catch (error) {
    return handleRouteError(error);
  }
}
