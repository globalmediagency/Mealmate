import { ok } from "@/lib/api/respond";
import { getConfigStatus } from "@/lib/env";

export const dynamic = "force-dynamic";

/** Non-secret status endpoint: which integrations are configured. */
export function GET() {
  return ok({ ok: true, config: getConfigStatus() });
}
