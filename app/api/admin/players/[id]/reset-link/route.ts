import type { NextRequest } from "next/server";
import { z } from "zod";
import { createPasswordResetLink } from "@/lib/admin/accounts";
import { isAdminSession } from "@/lib/admin/auth";
import { fail, handleRouteError, ok } from "@/lib/api/respond";

export const dynamic = "force-dynamic";

const idSchema = z.string().min(1).max(64);

/** The public origin of this deployment as the admin's browser reached it (behind Vercel's proxy). */
function requestOrigin(request: NextRequest): string {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? request.nextUrl.host;
  const protocol = request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(":", "");
  return `${protocol}://${host}`;
}

/**
 * POST /api/admin/players/:id/reset-link → a one-time link (24 h) letting
 * the player choose a new password, for the admin to pass on.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    if (!(await isAdminSession())) return fail("unauthorized", "Connexion admin requise.", 401);
    const { id } = await context.params;
    const link = await createPasswordResetLink(idSchema.parse(id), requestOrigin(request), request.headers);
    return ok(link, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return handleRouteError(error);
  }
}
