import { z } from "zod";
import { fail, handleRouteError, ok } from "@/lib/api/respond";
import { getSession } from "@/lib/auth/session";
import { listFriends, listRequests, sendFriendRequest } from "@/lib/friends/service";
import { getProfile } from "@/lib/profile/service";

export const dynamic = "force-dynamic";

const requestSchema = z.object({ query: z.string().trim().min(2).max(40) });

/** GET /api/friends → { me, friends, incoming, outgoing } */
export async function GET() {
  try {
    const session = await getSession();
    if (!session) return fail("unauthorized", "Connecte-toi pour continuer.", 401);
    const [profile, friends, requests] = await Promise.all([getProfile(session.user.id), listFriends(session.user.id), listRequests(session.user.id)]);
    return ok({ me: profile ? { username: profile.username, friendCode: profile.friendCode } : null, friends, ...requests });
  } catch (error) {
    return handleRouteError(error);
  }
}

/** POST /api/friends { query } → sends a request by friend code or pseudo. */
export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) return fail("unauthorized", "Connecte-toi pour continuer.", 401);
    const body = requestSchema.parse(await request.json().catch(() => ({})));
    return ok(await sendFriendRequest(session.user.id, body.query), { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
