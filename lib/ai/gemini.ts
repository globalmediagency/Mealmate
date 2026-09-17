import { DomainError } from "@/lib/api/errors";
import { optionalEnv, requireEnv } from "@/lib/env";
import {
  MEAL_RESPONSE_SCHEMA,
  MEAL_SYSTEM_PROMPT,
  MEAL_USER_PROMPT,
} from "./meal-prompt";
import { parseMealAnalysis, type MealAnalysis } from "./meal-schema";

const API_BASE = "https://generativelanguage.googleapis.com/v1beta";

/**
 * Fallback chain used when `GEMINI_MODEL` is not set and the live model list
 * cannot be fetched. Newest stable Flash first, previous Flash next.
 */
export const GEMINI_FALLBACK_MODELS = [
  "gemini-3.8-flash",
  "gemini-3.6-flash",
  "gemini-3.5-flash-lite",
  "gemini-2.5-flash",
];

export type GeminiModel = {
  name: string;
  displayName?: string;
  supportedGenerationMethods?: string[];
};

type ListModelsResponse = { models?: GeminiModel[]; nextPageToken?: string };

/** Lists the models available to the API key (used by /dev/gemini and model resolution); `timeoutMs` bounds the wait. */
export async function listGeminiModels(
  options: { timeoutMs?: number } = {},
): Promise<GeminiModel[]> {
  const [apiKey] = requireEnv("GEMINI_API_KEY");
  const models: GeminiModel[] = [];
  let pageToken: string | undefined;
  do {
    const url = new URL(`${API_BASE}/models`);
    url.searchParams.set("key", apiKey);
    url.searchParams.set("pageSize", "100");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const response = await fetch(url, {
      cache: "no-store",
      ...(options.timeoutMs
        ? { signal: AbortSignal.timeout(options.timeoutMs) }
        : {}),
    });
    if (!response.ok) throw new Error(`Gemini ListModels ${response.status}`);
    const body = (await response.json()) as ListModelsResponse;
    models.push(...(body.models ?? []));
    pageToken = body.nextPageToken;
  } while (pageToken);
  return models;
}

const STABLE_FLASH = /^models\/gemini-(\d+(?:\.\d+)?)-flash$/;

/**
 * Picks the newest stable `gemini-X.Y-flash` model that supports
 * generateContent (excludes previews, lite, image, tts, live… variants).
 */
export function pickLatestStableFlash(models: GeminiModel[]): string | null {
  let best: { name: string; version: number } | null = null;
  for (const model of models) {
    const match = STABLE_FLASH.exec(model.name);
    if (!match) continue;
    if (
      model.supportedGenerationMethods &&
      !model.supportedGenerationMethods.includes("generateContent")
    )
      continue;
    const version = Number.parseFloat(match[1]);
    if (!best || version > best.version)
      best = { name: model.name.replace(/^models\//, ""), version };
  }
  return best?.name ?? null;
}

let resolved: { models: string[]; at: number; ttl: number } | null = null;
let resolving: Promise<string[]> | null = null;
const RESOLVE_TTL_MS = 60 * 60 * 1000;
/** A failed listing is retried sooner than a successful one is refreshed. */
const RESOLVE_FAILED_TTL_MS = 5 * 60 * 1000;
/** The live listing must not delay an analysis for long: past this, the static chain is used. */
const LIST_TIMEOUT_MS = 1500;

/**
 * Ordered list of models to try: env override, then live latest stable
 * Flash, then fallbacks. Cached per instance; concurrent callers share one
 * listing. With `GEMINI_MODEL` set, no listing happens at all.
 */
export async function resolveGeminiModels(): Promise<string[]> {
  const override = optionalEnv("GEMINI_MODEL");
  const chain: string[] = override ? [override] : [];
  if (override) return [...new Set([...chain, ...GEMINI_FALLBACK_MODELS])];
  if (resolved && Date.now() - resolved.at < resolved.ttl)
    return [...resolved.models];
  if (!resolving) {
    resolving = (async () => {
      let live: string[] = [];
      let ok = false;
      try {
        const latest = pickLatestStableFlash(
          await listGeminiModels({ timeoutMs: LIST_TIMEOUT_MS }),
        );
        if (latest) live = [latest];
        ok = true;
      } catch {
        // Listing is best-effort; fall back to the static chain.
      }
      const models = [...new Set([...live, ...GEMINI_FALLBACK_MODELS])];
      resolved = {
        models,
        at: Date.now(),
        ttl: ok ? RESOLVE_TTL_MS : RESOLVE_FAILED_TTL_MS,
      };
      return models;
    })().finally(() => {
      resolving = null;
    });
  }
  return [...(await resolving)];
}

/** Warms what an analysis needs (the model choice), without a key nothing happens. */
export async function warmGemini(): Promise<void> {
  try {
    await resolveGeminiModels();
  } catch {
    // No key or no network: the analysis itself will report it.
  }
}

/**
 * Thinking settings tried in turn for a model, the first accepted one kept
 * for the instance: a photo of a plate needs recognition, not reasoning, and
 * the default "dynamic thinking" of the Flash models costs seconds. Each
 * family spells it differently (budget on 2.5, level on 3); a model that
 * refuses a shape (HTTP 400) gets the next one, down to no setting at all.
 */
export const THINKING_LADDER: readonly (Record<string, unknown> | null)[] = [
  { thinkingBudget: 0 },
  { thinkingLevel: "minimal" },
  { thinkingLevel: "low" },
  null,
];
const thinkingChoice = new Map<string, number>();

/** Test-only: forgets which thinking setting each model accepted. */
export function resetGeminiMemoForTests(): void {
  thinkingChoice.clear();
  resolved = null;
}

type GenerateResponse = {
  candidates?: {
    content?: { parts?: { text?: string }[] };
    finishReason?: string;
  }[];
  promptFeedback?: { blockReason?: string };
  error?: { code?: number; message?: string; status?: string };
};

async function generate(
  model: string,
  apiKey: string,
  image: { bytes: Uint8Array; mimeType: string },
  thinking: Record<string, unknown> | null,
): Promise<{ status: number; text: string | null; blocked: boolean }> {
  const response = await fetch(
    `${API_BASE}/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: MEAL_SYSTEM_PROMPT }] },
        contents: [
          {
            role: "user",
            parts: [
              {
                inlineData: {
                  mimeType: image.mimeType,
                  data: Buffer.from(image.bytes).toString("base64"),
                },
              },
              { text: MEAL_USER_PROMPT },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 1024,
          responseMimeType: "application/json",
          responseSchema: MEAL_RESPONSE_SCHEMA,
          ...(thinking ? { thinkingConfig: thinking } : {}),
        },
      }),
      cache: "no-store",
    },
  );
  if (!response.ok)
    return { status: response.status, text: null, blocked: false };
  const body = (await response.json()) as GenerateResponse;
  if (body.promptFeedback?.blockReason)
    return { status: 200, text: null, blocked: true };
  const text =
    body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ??
    null;
  return {
    status: 200,
    text: text && text.trim() ? text : null,
    blocked: false,
  };
}

/** Function shape used by the meal service (tests inject a fake). */
export type MealAnalyzer = (image: {
  bytes: Uint8Array;
  mimeType: string;
}) => Promise<MealAnalysis>;

/**
 * Analyses a meal photo with Gemini: strict JSON output validated with zod,
 * thinking switched off (see `THINKING_LADDER`), one retry on invalid JSON,
 * next model on 404 / 429 / 5xx.
 */
export const analyzeMealWithGemini: MealAnalyzer = async (image) => {
  const [apiKey] = requireEnv("GEMINI_API_KEY");
  const models = await resolveGeminiModels();
  let lastStatus = 0;
  for (const model of models) {
    let step = thinkingChoice.get(model) ?? 0;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      let result = await generate(model, apiKey, image, THINKING_LADDER[step]);
      // The model refuses this thinking setting: try the next shape, and remember what it took.
      while (result.status === 400 && step < THINKING_LADDER.length - 1) {
        step += 1;
        result = await generate(model, apiKey, image, THINKING_LADDER[step]);
      }
      thinkingChoice.set(model, step);
      lastStatus = result.status;
      if (
        result.status === 404 ||
        result.status === 429 ||
        result.status >= 500
      )
        break; // next model
      if (result.status !== 200) {
        throw new DomainError(
          "ai_error",
          `L'analyse a échoué (HTTP ${result.status}).`,
          502,
        );
      }
      if (result.blocked) {
        throw new DomainError(
          "ai_blocked",
          "Cette image n'a pas pu être analysée.",
          422,
        );
      }
      const parsed = result.text ? parseMealAnalysis(result.text) : null;
      if (parsed) return parsed;
      // invalid JSON → retry once with the same model
    }
  }
  throw new DomainError(
    "ai_unavailable",
    lastStatus === 429
      ? "L'analyse est saturée pour le moment. Réessaie dans une minute."
      : "L'analyse est indisponible pour le moment.",
    503,
  );
};
