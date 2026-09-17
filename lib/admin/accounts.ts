import { eq } from "drizzle-orm";
import { deleteAccount, type PurgeDeps, type PurgeReport } from "@/lib/account/service";
import { DomainError } from "@/lib/api/errors";
import { getAuth, type Auth } from "@/lib/auth";
import { captureResetToken, RESET_LINK_HOURS } from "@/lib/auth/reset-link";
import { getDb } from "@/lib/db";
import { user } from "@/lib/db/schema";

export type PasswordResetLink = {
  /** `<origin>/reset-password?token=…`, to hand to the player. */
  url: string;
  /** ISO date after which the link no longer works. */
  expiresAt: string;
  /** Hours the link stays valid (for the admin's screen). */
  validHours: number;
  email: string;
};

/**
 * A one-time link letting a player choose a new password, made for the
 * admin who will pass it on (MealMate sends no email). Better Auth creates
 * the token (valid `RESET_LINK_HOURS`, consumed on use, every other session
 * of the player closed once the password changes, spec § 3.20); the link
 * points to this deployment's `/reset-password` page.
 */
export async function createPasswordResetLink(userId: string, origin: string, headers: Headers, auth: Auth = getAuth(), now: Date = new Date()): Promise<PasswordResetLink> {
  const [row] = await getDb().select({ email: user.email }).from(user).where(eq(user.id, userId)).limit(1);
  if (!row) throw new DomainError("not_found", "Joueur inconnu.", 404);
  const { token } = await captureResetToken(() => auth.api.requestPasswordReset({ body: { email: row.email, redirectTo: "/reset-password" }, headers }));
  if (!token) throw new DomainError("reset_unavailable", "Le lien n'a pas pu être créé.", 500);
  const url = new URL("/reset-password", origin);
  url.searchParams.set("token", token);
  return { url: url.toString(), expiresAt: new Date(now.getTime() + RESET_LINK_HOURS * 3_600_000).toISOString(), validHours: RESET_LINK_HOURS, email: row.email };
}

/**
 * Deletes a player's account exactly like the player would from « Plus »:
 * photos (R2) and the Strava grant first, then the user row, from which every
 * MealMate table cascades (sessions included). `deleted` is false for an
 * unknown id.
 */
export async function deletePlayerAccount(userId: string, deps: PurgeDeps): Promise<PurgeReport & { deleted: boolean }> {
  return deleteAccount(userId, deps);
}
