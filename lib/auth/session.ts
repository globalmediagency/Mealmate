import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getAuth, type Session } from "@/lib/auth";
import { ConfigError, isConfigError } from "@/lib/env";
import { getProfile } from "@/lib/profile/service";
import type { Profile } from "@/lib/db/schema";

/** Reads the current session from cookies (memoised per request). */
export const getSession = cache(async (): Promise<Session | null> => {
  const auth = getAuth();
  return auth.api.getSession({ headers: await headers() });
});

/** Like `getSession` but never throws: config problems are returned instead. */
export const safeGetSession = cache(
  async (): Promise<{ session: Session | null; configError: ConfigError | null }> => {
    try {
      return { session: await getSession(), configError: null };
    } catch (error) {
      if (isConfigError(error)) return { session: null, configError: error };
      throw error;
    }
  },
);

export async function requireSession(nextPath?: string): Promise<Session> {
  const session = await getSession();
  if (!session) {
    redirect(nextPath ? `/login?next=${encodeURIComponent(nextPath)}` : "/login");
  }
  return session;
}

export type Viewer = { session: Session; profile: Profile };

/** Requires a signed-in user with a completed profile (memoised per request). */
export const requireViewer = cache(async (): Promise<Viewer> => {
  const session = await requireSession();
  const profile = await getProfile(session.user.id);
  if (!profile) redirect("/onboarding");
  return { session, profile };
});
