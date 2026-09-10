import type Stripe from "stripe";
import { fail, handleRouteError, ok } from "@/lib/api/respond";
import { getStripe, getStripeWebhookSecret } from "@/lib/payments/stripe";
import { creditPurchase } from "@/lib/shop/service";
import { sessionInfo } from "@/lib/shop/stripe-provider";

export const dynamic = "force-dynamic";

/**
 * POST /api/webhooks/stripe — Stripe calls this after a checkout. The raw
 * body is verified with STRIPE_WEBHOOK_SECRET; crediting is idempotent.
 */
export async function POST(request: Request) {
  try {
    const signature = request.headers.get("stripe-signature");
    if (!signature) return fail("missing_signature", "Signature Stripe absente.", 400);
    const payload = await request.text();
    // Resolved outside the signature try/catch so a missing env var still yields a 503 ConfigError.
    const stripe = getStripe();
    const webhookSecret = getStripeWebhookSecret();
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
    } catch (error) {
      console.warn("[stripe] invalid webhook signature", error instanceof Error ? error.message : error);
      return fail("invalid_signature", "Signature Stripe invalide.", 400);
    }

    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      const info = sessionInfo(event.data.object);
      if (info.paid) {
        const outcome = await creditPurchase({ sessionId: info.id, userId: info.userId, item: info.item, amountCents: info.amountCents });
        return ok({ received: true, credited: outcome.credited });
      }
    }
    return ok({ received: true, credited: false });
  } catch (error) {
    return handleRouteError(error);
  }
}
