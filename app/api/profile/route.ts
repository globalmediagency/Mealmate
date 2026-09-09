import { z } from "zod";
import { fail, handleRouteError, ok } from "@/lib/api/respond";
import { getSession } from "@/lib/auth/session";
import {
  createProfile,
  getProfile,
  UsernameTakenError,
} from "@/lib/profile/service";
import { usernameSchema } from "@/lib/profile/username";

export const dynamic = "force-dynamic";

const createSchema = z.object({ username: usernameSchema });

/** GET /api/profile → the signed-in user's profile. */
export async function GET() {
  try {
    const session = await getSession();
    if (!session) return fail("unauthorized", "Connecte-toi pour continuer.", 401);
    const profile = await getProfile(session.user.id);
    if (!profile) return fail("profile_missing", "Choisis d'abord un pseudo.", 404);
    return ok({ profile });
  } catch (error) {
    return handleRouteError(error);
  }
}

/** POST /api/profile { username } → creates the profile (onboarding). */
export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) return fail("unauthorized", "Connecte-toi pour continuer.", 401);
    const existing = await getProfile(session.user.id);
    if (existing) return fail("profile_exists", "Tu as déjà un pseudo.", 409);

    const body = createSchema.parse(await request.json().catch(() => ({})));
    try {
      const profile = await createProfile(session.user.id, body.username);
      return ok({ profile }, { status: 201 });
    } catch (error) {
      if (error instanceof UsernameTakenError) {
        return fail(error.code, error.message, 409);
      }
      throw error;
    }
  } catch (error) {
    return handleRouteError(error);
  }
}
