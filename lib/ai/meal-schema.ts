import { z } from "zod";

export const VERDICTS = ["sain", "correct", "peu_sain"] as const;
export type Verdict = (typeof VERDICTS)[number];
export const PORTIONS = ["raisonnable", "copieuse", "legere"] as const;
export type Portion = (typeof PORTIONS)[number];
/** Where the picture comes from: a real plate, a screen showing food, a printed picture, or unclear. */
export const PHOTO_SOURCES = ["real", "screen", "printed", "unknown"] as const;
export type PhotoSource = (typeof PHOTO_SOURCES)[number];

const note = z.coerce.number().transform((n) => Math.max(1, Math.min(5, Math.round(n))));
const shortText = z.string().trim().max(400).catch("");

/** Strict contract expected from Gemini (spec § 3.5), normalised. */
export const mealAnalysisSchema = z.object({
  is_food: z.boolean(),
  score: z.coerce.number().transform((n) => Math.max(0, Math.min(100, Math.round(n)))),
  verdict: z.string().transform((v) => normaliseVerdict(v)),
  foods: z.array(z.string().trim().min(1).max(60)).max(15).catch([]),
  macros: z.object({
    proteins: note.catch(3),
    fibers: note.catch(3),
    carbs: note.catch(3),
    fats: note.catch(3),
    sugars: note.catch(3),
    ultra_processed: note.catch(3),
  }),
  portion: z.string().transform((p) => normalisePortion(p)),
  comment: shortText,
  creature_line: shortText,
  // Missing or odd value → "unknown": an older analyzer never blocks a meal.
  photo_source: z.string().transform((v) => normalisePhotoSource(v)).catch("unknown" as PhotoSource),
});

export type MealAnalysis = z.infer<typeof mealAnalysisSchema>;
export type MealMacros = MealAnalysis["macros"];

export const MACRO_LABELS: Record<keyof MealMacros, string> = {
  proteins: "Protéines",
  fibers: "Fibres",
  carbs: "Féculents",
  fats: "Bons gras",
  sugars: "Sucres",
  ultra_processed: "Ultra-transformé",
};

/** Macros where a high note is a bad sign (inverted colour on the bars). */
export const NEGATIVE_MACROS: ReadonlySet<keyof MealMacros> = new Set(["sugars", "ultra_processed"]);

function normaliseVerdict(value: string): Verdict {
  const v = value.toLowerCase().replace(/[\s-]+/g, "_");
  if (v.startsWith("sain")) return "sain";
  if (v.startsWith("peu")) return "peu_sain";
  return "correct";
}

function normalisePortion(value: string): Portion {
  const v = value.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (v.startsWith("cop")) return "copieuse";
  if (v.startsWith("leg")) return "legere";
  return "raisonnable";
}

function normalisePhotoSource(value: string): PhotoSource {
  const v = value.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (/screen|ecran|monitor|display|phone|tablet|\btv\b|television/.test(v)) return "screen";
  if (/print|imprim|paper|papier|magazine|menu|packag|emballage|poster|affiche/.test(v)) return "printed";
  if (/real|reel|plate|assiette|direct|photo/.test(v)) return "real";
  return "unknown";
}

/** Screen and printed pictures are the easy way to cheat: flagged, and refusable from /admin. */
export function isSuspiciousPhoto(source: PhotoSource | string | null | undefined): boolean {
  return source === "screen" || source === "printed";
}

export const PHOTO_SOURCE_LABELS: Record<PhotoSource, string> = {
  real: "Vraie assiette",
  screen: "Photo d'écran",
  printed: "Image imprimée",
  unknown: "Origine incertaine",
};

/** Verdict consistent with the score when the model contradicts itself. */
export function verdictFromScore(score: number): Verdict {
  if (score >= 65) return "sain";
  if (score >= 40) return "correct";
  return "peu_sain";
}

export const VERDICT_LABELS: Record<Verdict, string> = {
  sain: "Sain",
  correct: "Correct",
  peu_sain: "Peu sain",
};

export const PORTION_LABELS: Record<Portion, string> = {
  raisonnable: "Portion raisonnable",
  copieuse: "Portion copieuse",
  legere: "Portion légère",
};

/** Parses raw model text (JSON, possibly wrapped in code fences) into a MealAnalysis. */
export function parseMealAnalysis(raw: string): MealAnalysis | null {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let json: unknown;
  try {
    json = JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start === -1 || end <= start) return null;
    try {
      json = JSON.parse(cleaned.slice(start, end + 1));
    } catch {
      return null;
    }
  }
  const result = mealAnalysisSchema.safeParse(json);
  return result.success ? result.data : null;
}
