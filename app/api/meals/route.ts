import type { NextRequest } from "next/server";
import { analyzeMealWithGemini } from "@/lib/ai/gemini";
import { fail, handleRouteError, ok } from "@/lib/api/respond";
import { getSession } from "@/lib/auth/session";
import { FEEDING } from "@/lib/game/config";
import { toCreatureView } from "@/lib/game/creature-view";
import { getGameRules } from "@/lib/game/rules-service";
import { feedCreature, listMeals, mealStats, purgeExpiredMeals, toMealView } from "@/lib/meals/service";
import { r2Storage } from "@/lib/storage/r2";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
/** Gemini can take a few seconds; Vercel Hobby allows up to 60 s. */
export const maxDuration = 60;

const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

/** GET /api/meals → { meals, stats } */
export async function GET() {
  try {
    const session = await getSession();
    if (!session) return fail("unauthorized", "Connecte-toi pour continuer.", 401);
    await purgeExpiredMeals(session.user.id, r2Storage, new Date(), (await getGameRules()).feeding.mealRetentionDays);
    const [meals, stats] = await Promise.all([listMeals(session.user.id, r2Storage), mealStats(session.user.id)]);
    return ok({ meals, stats });
  } catch (error) {
    return handleRouteError(error);
  }
}

/** POST /api/meals (multipart, field `image`) → analysis + effects. */
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return fail("unauthorized", "Connecte-toi pour continuer.", 401);

    const form = await request.formData().catch(() => null);
    const file = form?.get("image");
    if (!(file instanceof File)) return fail("validation_error", "Aucune image reçue.", 400);
    if (!ACCEPTED_TYPES.has(file.type)) return fail("validation_error", "Format d'image non pris en charge (JPEG, PNG ou WebP).", 400);
    if (file.size > FEEDING.maxImageBytesBeforeResize) return fail("validation_error", "Image trop lourde (4 Mo maximum).", 413);
    if (file.size === 0) return fail("validation_error", "Image vide.", 400);

    const bytes = new Uint8Array(await file.arrayBuffer());
    const rules = await getGameRules();
    const result = await feedCreature({
      userId: session.user.id,
      image: { bytes, mimeType: file.type },
      analyzer: analyzeMealWithGemini,
      storage: r2Storage,
      rules,
    });

    return ok({
      meal: await toMealView(result.meal, r2Storage),
      analysis: result.analysis,
      effects: result.effects,
      before: result.before,
      creature: toCreatureView(result.creature, new Date(), rules),
      mealsToday: result.mealsToday,
      others: result.others.map((o) => ({
        name: o.creature.name,
        ownerName: o.ownerName,
        healthDelta: o.effects.healthDelta,
        hungerBefore: Math.round(o.before.hunger),
        hungerAfter: Math.round(o.creature.hunger),
      })),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
