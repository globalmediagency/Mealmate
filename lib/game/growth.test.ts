import { describe, expect, it } from "vitest";
import { stageForXp, xpToNextStage } from "./growth";

describe("stageForXp", () => {
  it("starts as a baby", () => {
    expect(stageForXp(0).id).toBe("bebe");
    expect(stageForXp(149).id).toBe("bebe");
  });

  it("crosses each threshold exactly at the boundary", () => {
    expect(stageForXp(150).id).toBe("enfant");
    expect(stageForXp(499).id).toBe("enfant");
    expect(stageForXp(500).id).toBe("adulte");
    expect(stageForXp(1199).id).toBe("adulte");
    expect(stageForXp(1200).id).toBe("sage");
    expect(stageForXp(99_999).id).toBe("sage");
  });
});

describe("xpToNextStage", () => {
  it("counts the remaining xp", () => {
    expect(xpToNextStage(0)).toBe(150);
    expect(xpToNextStage(140)).toBe(10);
    expect(xpToNextStage(500)).toBe(700);
  });

  it("returns null at the last stage", () => {
    expect(xpToNextStage(1200)).toBeNull();
  });
});
