import { NextResponse } from "next/server";
import { requestOrigin } from "@/lib/api/origin";
import { getSession } from "@/lib/auth/session";
import { stravaApi } from "@/lib/strava/api";
import { connectStrava } from "@/lib/strava/service";
import { verifyStravaState } from "@/lib/strava/state";

export const dynamic = "force-dynamic";

/**
 * GET /api/strava/callback?code&state&scope — Strava sends the user back here.
 * Every outcome redirects to /activity with a `strava=` notice.
 */
export async function GET(request: Request) {
  const origin = requestOrigin(request);
  const back = (notice: string) => NextResponse.redirect(new URL(`/activity?strava=${notice}`, origin));
  try {
    const params = new URL(request.url).searchParams;
    if (params.get("error")) return back("denied");
    const session = await getSession();
    if (!session) return NextResponse.redirect(new URL("/login?next=/activity", origin));
    if (!verifyStravaState(params.get("state"), session.user.id)) return back("state");
    const code = params.get("code");
    if (!code) return back("error");
    const scope = params.get("scope") ?? "";
    if (!/activity:read/.test(scope)) return back("scope");
    await connectStrava(session.user.id, code, stravaApi);
    return back("connected");
  } catch (error) {
    console.error("[strava] callback failed", error instanceof Error ? error.message : error);
    return back("error");
  }
}
