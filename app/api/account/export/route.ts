import { fail, handleRouteError } from "@/lib/api/respond";
import { exportAccount } from "@/lib/account/service";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** GET /api/account/export → downloads everything MealMate holds about the user (JSON). */
export async function GET() {
  try {
    const session = await getSession();
    if (!session) return fail("unauthorized", "Connecte-toi pour continuer.", 401);
    const data = await exportAccount(session.user.id);
    const stamp = data.exportedAt.slice(0, 10);
    return new Response(JSON.stringify(data, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="mealmate-export-${stamp}.json"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
