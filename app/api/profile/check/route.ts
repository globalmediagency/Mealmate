import type { NextRequest } from "next/server";
import { handleRouteError, ok } from "@/lib/api/respond";
import { isUsernameAvailable } from "@/lib/profile/service";
import { validateUsername } from "@/lib/profile/username";

export const dynamic = "force-dynamic";

/** GET /api/profile/check?username=… → { valid, available, message? } */
export async function GET(request: NextRequest) {
  try {
    const validation = validateUsername(request.nextUrl.searchParams.get("username") ?? "");
    if (!validation.ok) {
      return ok({ valid: false, available: false, message: validation.message });
    }
    const available = await isUsernameAvailable(validation.username);
    return ok({
      valid: true,
      available,
      message: available ? undefined : "Ce pseudo est déjà pris.",
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
