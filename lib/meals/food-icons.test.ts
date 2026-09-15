import { describe, expect, it } from "vitest";
import { FOOD_DRAWINGS } from "@/components/food/food-icon";
import { classifyFood, FOOD_FAMILIES, FOOD_KIND_LABELS, FOOD_KINDS, foodKindsFor } from "./food-icons";

describe("classifyFood", () => {
  it("recognises common French food names, accents or not", () => {
    expect(classifyFood("saumon grillé")).toBe("fish");
    expect(classifyFood("Pâtes carbonara")).toBe("pasta");
    expect(classifyFood("pates")).toBe("pasta");
    expect(classifyFood("frites")).toBe("fries");
    expect(classifyFood("cheeseburger")).toBe("burger");
    expect(classifyFood("salade verte")).toBe("salad");
    expect(classifyFood("brocoli vapeur")).toBe("broccoli");
    expect(classifyFood("courgettes grillées")).toBe("vegetables");
    expect(classifyFood("pomme")).toBe("apple");
    expect(classifyFood("pomme de terre")).toBe("potato");
    expect(classifyFood("purée")).toBe("potato");
    expect(classifyFood("banane")).toBe("banana");
    expect(classifyFood("œufs brouillés")).toBe("egg");
    expect(classifyFood("gâteau au chocolat")).toBe("chocolate");
    expect(classifyFood("tarte aux pommes")).toBe("pie");
    expect(classifyFood("tomates cerises")).toBe("tomato");
    expect(classifyFood("bœuf bourguignon")).toBe("soup");
    expect(classifyFood("crevettes")).toBe("shrimp");
    expect(classifyFood("lentilles corail")).toBe("beans");
    expect(classifyFood("fraises")).toBe("strawberry");
    expect(classifyFood("verre de lait")).toBe("milk");
    expect(classifyFood("eau")).toBe("water");
    expect(classifyFood("thé vert")).toBe("tea");
    expect(classifyFood("cuisse de poulet")).toBe("drumstick");
    expect(classifyFood("ramen")).toBe("noodles");
    expect(classifyFood("croissant")).toBe("croissant");
    expect(classifyFood("pain")).toBe("bread");
    expect(classifyFood("hot-dog")).toBe("hotdog");
    expect(classifyFood("coca-cola")).toBe("soda");
    expect(classifyFood("café")).toBe("coffee");
    expect(classifyFood("riz basmati")).toBe("rice");
    expect(classifyFood("quinoa")).toBe("rice");
    expect(classifyFood("poulet rôti")).toBe("drumstick");
    expect(classifyFood("blanc de poulet")).toBe("chicken");
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
    expect(foodKindsFor(["saumon grillé", "quinoa", "avocat", "brocoli"])).toEqual(["fish", "rice", "avocado"]);
    expect(foodKindsFor(["pâtes", "pâtes au pesto", "parmesan"])).toEqual(["pasta", "cheese"]);
    expect(foodKindsFor([])).toEqual(["plate"]);
    expect(foodKindsFor(["a", "b"], 1)).toEqual(["plate"]);
  });

  it("has 100 foods plus the plate, each with a label and a drawing", () => {
    expect(FOOD_KINDS).toHaveLength(101);
    expect(new Set(FOOD_KINDS).size).toBe(101);
    for (const kind of FOOD_KINDS) {
      expect(FOOD_KIND_LABELS[kind]).toBeTruthy();
      expect(FOOD_DRAWINGS[kind]).toBeTruthy();
    }
  });

  it("lists every kind exactly once in the admin families", () => {
    const listed = FOOD_FAMILIES.flatMap((f) => f.kinds);
    expect(listed).toHaveLength(FOOD_KINDS.length);
    expect(new Set(listed).size).toBe(FOOD_KINDS.length);
    for (const kind of FOOD_KINDS) expect(listed).toContain(kind);
  });

  it("only produces known kinds", () => {
    for (const kind of foodKindsFor(["pizza", "bière", "glace"])) expect(FOOD_KINDS).toContain(kind);
  });
});
