import type Stripe from "stripe";
import { getStripe } from "@/lib/payments/stripe";
import type { CheckoutProvider, CheckoutSessionInfo } from "./provider";

export function sessionInfo(session: Stripe.Checkout.Session): CheckoutSessionInfo {
  return {
    id: session.id,
    paid: session.payment_status === "paid" || session.payment_status === "no_payment_required",
    expired: session.status === "expired",
    userId: session.metadata?.userId ?? session.client_reference_id ?? null,
    item: session.metadata?.item ?? null,
    amountCents: session.amount_total ?? null,
  };
}

/** Stripe Checkout with inline `price_data` (no product to create in the dashboard). */
export const stripeProvider: CheckoutProvider = {
  async createSession(input) {
    const session = await getStripe().checkout.sessions.create({
      mode: "payment",
      client_reference_id: input.userId,
      metadata: { userId: input.userId, item: input.item },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "eur",
            unit_amount: input.amountCents,
            product_data: { name: `MealMate — ${input.label}`, description: input.description },
          },
        },
      ],
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      locale: "fr",
    });
    if (!session.url) throw new Error("Stripe did not return a checkout URL");
    return { id: session.id, url: session.url };
  },
  async retrieveSession(id) {
    try {
      const session = await getStripe().checkout.sessions.retrieve(id);
      return sessionInfo(session);
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === "resource_missing") return null;
      throw error;
    }
  },
};
