import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/lib/auth";
import { handleRouteError } from "@/lib/api/respond";

/**
 * Better Auth catch-all. The auth instance is created lazily so that a
 * missing `DATABASE_URL` / `BETTER_AUTH_SECRET` yields a clean 503 instead
 * of breaking the build or crashing the function.
 */
async function handler(request: Request): Promise<Response> {
  try {
    return await getAuth().handler(request);
  } catch (error) {
    return handleRouteError(error);
  }
}

export const { GET, POST } = toNextJsHandler(handler);
