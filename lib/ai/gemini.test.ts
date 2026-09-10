import { describe, expect, it } from "vitest";
import { pickLatestStableFlash } from "./gemini";

describe("pickLatestStableFlash", () => {
  it("prefers the highest stable flash version supporting generateContent", () => {
    const pick = pickLatestStableFlash([
      { name: "models/gemini-2.5-flash", supportedGenerationMethods: ["generateContent"] },
      { name: "models/gemini-3.6-flash", supportedGenerationMethods: ["generateContent"] },
      { name: "models/gemini-3.8-flash-preview", supportedGenerationMethods: ["generateContent"] },
      { name: "models/gemini-3.6-flash-lite", supportedGenerationMethods: ["generateContent"] },
      { name: "models/gemini-3.6-flash-image", supportedGenerationMethods: ["generateContent"] },
      { name: "models/gemini-4.0-flash", supportedGenerationMethods: ["embedContent"] },
    ]);
    expect(pick).toBe("gemini-3.6-flash");
  });

  it("returns null when nothing matches", () => {
    expect(pickLatestStableFlash([{ name: "models/gemini-pro" }])).toBeNull();
  });
});
