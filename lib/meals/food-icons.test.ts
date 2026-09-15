import { describe, expect, it } from "vitest";
import { classifyFood, FOOD_KINDS, foodKindsFor } from "./food-icons";

describe("classifyFood", () => {
  it("recognises common French food names, accents or not", () => {
    expect(classifyFood("saumon grillé")).toBe("fish");
    expect(classifyFood("Pâtes carbonara")).toBe("pasta");
    expect(classifyFood("pates")).toBe("pasta");
    expect(classifyFood("frites")).toBe("fries");
    expect(classifyFood("cheeseburger")).toBe("burger");
    expect(classifyFood("salade verte")).toBe("salad");
    expect(classifyFood("brocoli vapeur")).toBe("vegetables");
    expect(classifyFood("pomme")).toBe("apple");
    expect(classifyFood("pomme de terre")).toBe("bread");
    expect(classifyFood("banane")).toBe("banana");
    expect(classifyFood("œufs brouillés")).toBe("egg");
    expect(classifyFood("gâteau au chocolat")).toBe("chocolate");
    expect(classifyFood("tarte aux pommes")).toBe("cake");
    expect(classifyFood("coca-cola")).toBe("soda");
    expect(classifyFood("café")).toBe("coffee");
    expect(classifyFood("riz basmati")).toBe("rice");
    expect(classifyFood("quinoa")).toBe("rice");
    expect(classifyFood("poulet rôti")).toBe("chicken");
    expect(classifyFood("steak haché")).toBe("meat");
    expect(classifyFood("soupe de légumes")).toBe("soup");
  });

  it("falls back to a plate", () => {
    expect(classifyFood("chose inconnue")).toBe("plate");
    expect(classifyFood("")).toBe("plate");
  });
});

describe("foodKindsFor", () => {
  it("keeps distinct kinds in order, at most three, and never returns an empty list", () => {
    expect(foodKindsFor(["saumon grillé", "quinoa", "avocat", "brocoli"])).toEqual(["fish", "rice", "fruit"]);
    expect(foodKindsFor(["pâtes", "pâtes au pesto", "parmesan"])).toEqual(["pasta", "cheese"]);
    expect(foodKindsFor([])).toEqual(["plate"]);
    expect(foodKindsFor(["a", "b"], 1)).toEqual(["plate"]);
  });

  it("only produces known kinds", () => {
    for (const kind of foodKindsFor(["pizza", "bière", "glace"])) expect(FOOD_KINDS).toContain(kind);
  });
});
