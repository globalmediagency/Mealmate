import { describe, expect, it } from "vitest";
import { isSuspiciousPhoto, parseMealAnalysis, verdictFromScore } from "./meal-schema";

const VALID = {
  is_food: true,
  score: 82,
  verdict: "sain",
  foods: ["saumon grillé", "quinoa", "avocat", "brocoli"],
  macros: { proteins: 4, fibers: 4, carbs: 3, fats: 3, sugars: 1, ultra_processed: 1 },
  portion: "raisonnable",
  comment: "Une assiette équilibrée, riche en bons gras. Bravo !",
  creature_line: "Miam, du saumon ! Je me sens plus fort.",
};

describe("parseMealAnalysis", () => {
  it("parses the documented payload", () => {
    const parsed = parseMealAnalysis(JSON.stringify(VALID));
    expect(parsed).toMatchObject({ is_food: true, score: 82, verdict: "sain", portion: "raisonnable" });
    expect(parsed?.foods).toHaveLength(4);
  });

  it("tolerates code fences, clamps and rounds", () => {
    const raw = "```json\n" + JSON.stringify({ ...VALID, score: 132.6, macros: { ...VALID.macros, sugars: 9, fats: 0 } }) + "\n```";
    const parsed = parseMealAnalysis(raw);
    expect(parsed?.score).toBe(100);
    expect(parsed?.macros.sugars).toBe(5);
    expect(parsed?.macros.fats).toBe(1);
  });

  it("normalises verdict and portion spelling", () => {
    const parsed = parseMealAnalysis(JSON.stringify({ ...VALID, verdict: "Peu sain", portion: "Légère" }));
    expect(parsed?.verdict).toBe("peu_sain");
    expect(parsed?.portion).toBe("legere");
  });

  it("normalises photo_source and never blocks on a missing value", () => {
    expect(parseMealAnalysis(JSON.stringify(VALID))?.photo_source).toBe("unknown");
    expect(parseMealAnalysis(JSON.stringify({ ...VALID, photo_source: "screen" }))?.photo_source).toBe("screen");
    expect(parseMealAnalysis(JSON.stringify({ ...VALID, photo_source: "Photo d'écran" }))?.photo_source).toBe("screen");
    expect(parseMealAnalysis(JSON.stringify({ ...VALID, photo_source: "image imprimée" }))?.photo_source).toBe("printed");
    expect(parseMealAnalysis(JSON.stringify({ ...VALID, photo_source: "real" }))?.photo_source).toBe("real");
    expect(parseMealAnalysis(JSON.stringify({ ...VALID, photo_source: 42 }))?.photo_source).toBe("unknown");
    expect(isSuspiciousPhoto("screen")).toBe(true);
    expect(isSuspiciousPhoto("printed")).toBe(true);
    expect(isSuspiciousPhoto("real")).toBe(false);
    expect(isSuspiciousPhoto("unknown")).toBe(false);
  });

  it("returns null for garbage or missing required fields", () => {
    expect(parseMealAnalysis("pas du json")).toBeNull();
    expect(parseMealAnalysis(JSON.stringify({ score: 50 }))).toBeNull();
  });

  it("accepts a not-food answer", () => {
    const parsed = parseMealAnalysis(
      JSON.stringify({ ...VALID, is_food: false, score: 0, foods: [], comment: "Pas de repas ici.", creature_line: "" }),
    );
    expect(parsed?.is_food).toBe(false);
  });
});

describe("verdictFromScore", () => {
  it("maps score bands", () => {
    expect(verdictFromScore(90)).toBe("sain");
    expect(verdictFromScore(50)).toBe("correct");
    expect(verdictFromScore(20)).toBe("peu_sain");
  });
});
