import { NextResponse } from "next/server";
import { requestOrigin } from "@/lib/api/origin";
import { handleRouteError } from "@/lib/api/respond";
import { getSession } from "@/lib/auth/session";
import { isConfigError } from "@/lib/env";
import { stravaApi } from "@/lib/strava/api";
import { createStravaState } from "@/lib/strava/state";

export const dynamic = "force-dynamic";

/** GET /api/strava/connect → redirects the signed-in user to Strava's consent screen. */
export async function GET(request: Request) {
  const origin = requestOrigin(request);
  try {
    const session = await getSession();
    if (!session) return NextResponse.redirect(new URL("/login?next=/activity", origin));
    const url = stravaApi.authorizeUrl({ redirectUri: `${origin}/api/strava/callback`, state: createStravaState(session.user.id) });
    return NextResponse.redirect(url);
  } catch (error) {
    // A top-level navigation: send the user back to the activity page with a readable notice.
    if (isConfigError(error)) return NextResponse.redirect(new URL("/activity?strava=config", origin));
    return handleRouteError(error);
  }
}
