import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  analyzeMealWithGemini,
  pickLatestStableFlash,
  resetGeminiMemoForTests,
  THINKING_LADDER,
} from "./gemini";

describe("pickLatestStableFlash", () => {
  it("prefers the highest stable flash version supporting generateContent", () => {
    const pick = pickLatestStableFlash([
      {
        name: "models/gemini-2.5-flash",
        supportedGenerationMethods: ["generateContent"],
      },
      {
        name: "models/gemini-3.6-flash",
        supportedGenerationMethods: ["generateContent"],
      },
      {
        name: "models/gemini-3.8-flash-preview",
        supportedGenerationMethods: ["generateContent"],
      },
      {
        name: "models/gemini-3.6-flash-lite",
        supportedGenerationMethods: ["generateContent"],
      },
      {
        name: "models/gemini-3.6-flash-image",
        supportedGenerationMethods: ["generateContent"],
      },
      {
        name: "models/gemini-4.0-flash",
        supportedGenerationMethods: ["embedContent"],
      },
    ]);
    expect(pick).toBe("gemini-3.6-flash");
  });

  it("returns null when nothing matches", () => {
    expect(pickLatestStableFlash([{ name: "models/gemini-pro" }])).toBeNull();
  });
});

const VALID = JSON.stringify({
  is_food: true,
  score: 80,
  verdict: "sain",
  foods: ["pomme"],
  macros: {
    proteins: 2,
    fibers: 4,
    carbs: 2,
    fats: 2,
    sugars: 1,
    ultra_processed: 1,
  },
  portion: "raisonnable",
  comment: "Bravo",
  creature_line: "Miam !",
  photo_source: "real",
});

describe("analyzeMealWithGemini", () => {
  beforeEach(() => {
    process.env.GEMINI_API_KEY = "test-key";
    process.env.GEMINI_MODEL = "gemini-test";
    resetGeminiMemoForTests();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.GEMINI_MODEL;
    delete process.env.GEMINI_API_KEY;
  });

  it("asks for no thinking, steps down the ladder when the model refuses a setting, and remembers what it took", async () => {
    const calls: Array<{ url: string; config: Record<string, unknown> }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as {
          generationConfig: Record<string, unknown>;
        };
        calls.push({ url: String(url), config: body.generationConfig });
        const thinking = body.generationConfig.thinkingConfig as
          | Record<string, unknown>
          | undefined;
        if (thinking && "thinkingBudget" in thinking)
          return new Response(
            JSON.stringify({
              error: { code: 400, message: "Unknown name thinkingBudget" },
            }),
            { status: 400 },
          );
        return new Response(
          JSON.stringify({
            candidates: [{ content: { parts: [{ text: VALID }] } }],
          }),
          { status: 200 },
        );
      }),
    );
    const image = { bytes: new Uint8Array([1, 2, 3]), mimeType: "image/jpeg" };
    const result = await analyzeMealWithGemini(image);
    expect(result.score).toBe(80);
    expect(result.photo_source).toBe("real");
    // With GEMINI_MODEL set, no model listing: every call is a generation on that model.
    expect(
      calls.every((c) => c.url.includes("/models/gemini-test:generateContent")),
    ).toBe(true);
    expect(calls.map((c) => c.config.thinkingConfig)).toEqual([
      THINKING_LADDER[0],
      THINKING_LADDER[1],
    ]);
    // The next analysis goes straight to the accepted setting.
    await analyzeMealWithGemini(image);
    expect(calls).toHaveLength(3);
    expect(calls[2].config.thinkingConfig).toEqual(THINKING_LADDER[1]);
  });

  it("keeps the JSON contract and the retry on an invalid answer", async () => {
    let n = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        n += 1;
        const text = n === 1 ? "pas du json" : VALID;
        return new Response(
          JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }),
          { status: 200 },
        );
      }),
    );
    const result = await analyzeMealWithGemini({
      bytes: new Uint8Array([9]),
      mimeType: "image/png",
    });
    expect(result.verdict).toBe("sain");
    expect(n).toBe(2);
  });
});
