import { AsyncLocalStorage } from "node:async_hooks";

/** How long a password link made by the admin stays valid (hours). */
export const RESET_LINK_HOURS = 24;

type Capture = { token: string | null };

/**
 * MealMate sends no email. When Better Auth generates a password-reset token
 * (`requestPasswordReset`), its `sendResetPassword` hook hands the token to
 * whoever asked for it in the same call chain: the admin route wraps the
 * request in `captureResetToken()` and builds the link itself. Outside such
 * a capture the token goes nowhere (the public endpoint is disabled anyway).
 */
const captures = new AsyncLocalStorage<Capture>();

/** Runs `fn` and returns, with its result, the reset token Better Auth generated meanwhile (null when none). */
export async function captureResetToken<T>(fn: () => Promise<T>): Promise<{ result: T; token: string | null }> {
  const capture: Capture = { token: null };
  const result = await captures.run(capture, fn);
  return { result, token: capture.token };
}

/** Better Auth's `sendResetPassword`: gives the token to the pending capture, if any. */
export function handOverResetToken(token: string): void {
  const capture = captures.getStore();
  if (capture) capture.token = token;
}
