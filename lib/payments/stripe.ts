/**
 * Lazy Stripe client. The SDK is instantiated on first use so that the build
 * and every page not related to the shop work without STRIPE_SECRET_KEY.
 */
import Stripe from "stripe";
import { requireEnv } from "@/lib/env";

let cached: Stripe | null = null;

export function getStripe(): Stripe {
  if (cached) return cached;
  const [secretKey] = requireEnv("STRIPE_SECRET_KEY");
  cached = new Stripe(secretKey, { appInfo: { name: "MealMate" } });
  return cached;
}

export function getStripeWebhookSecret(): string {
  return requireEnv("STRIPE_WEBHOOK_SECRET")[0];
}

/** True when the key is a test-mode key (shown as a notice in the shop). */
export function isStripeTestMode(secretKey: string): boolean {
  return secretKey.startsWith("sk_test_") || secretKey.startsWith("rk_test_");
}
