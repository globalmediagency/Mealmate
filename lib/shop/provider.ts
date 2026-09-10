import type { ShopItemId } from "@/lib/game/config";

export type CheckoutSessionInput = {
  userId: string;
  item: ShopItemId;
  label: string;
  description: string;
  amountCents: number;
  successUrl: string;
  cancelUrl: string;
};

export type CheckoutSessionInfo = {
  id: string;
  /** Payment confirmed by the provider. */
  paid: boolean;
  /** Session expired or abandoned. */
  expired: boolean;
  userId: string | null;
  item: string | null;
  amountCents: number | null;
};

/** Payment provider abstraction: Stripe in production, an in-memory fake in tests. */
export type CheckoutProvider = {
  createSession(input: CheckoutSessionInput): Promise<{ id: string; url: string }>;
  retrieveSession(id: string): Promise<CheckoutSessionInfo | null>;
};
