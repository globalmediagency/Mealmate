import { describe, expect, it } from "vitest";
import type { CreatureView } from "./creature-view";
import { ageLabel, creatureLine, hungerLabel } from "./dialogue";

function view(overrides: Partial<CreatureView> = {}): CreatureView {
  return {
    id: "c1",
    status: "alive",
    tier: "facile",
    name: "Miso",
    species: { id: "facile-chat-rond", tier: "facile", rarity: "commun", name: "Chabond", tagline: "Ronronne." },
    rarity: "commun",
    eggSteps: 0,
    hatchSteps: 15000,
    hatchProgress: 1,
    canHatch: false,
    health: 100,
    hunger: 0,
    mood: 100,
    xp: 0,
    stage: { id: "bebe", label: "Bébé", minXp: 0 },
    xpToNextStage: 150,
    state: "healthy",
    ageDays: 3,
    createdAt: "2026-09-01T00:00:00.000Z",
    hatchedAt: "2026-09-03T00:00:00.000Z",
    diedAt: null,
    lifespanDays: null,
    ...overrides,
  };
}

describe("creatureLine", () => {
  it("prioritises sickness, then hunger, then tiredness, then mood", () => {
    expect(creatureLine(view({ health: 20, hunger: 90 }))).toBe("Je ne me sens pas bien…");
    expect(creatureLine(view({ health: 50, hunger: 85 }))).toBe("J'ai trop faim…");
    expect(creatureLine(view({ health: 50, hunger: 65 }))).toBe("J'ai faim…");
    expect(creatureLine(view({ health: 50 }))).toBe("Je suis un peu fatigué·e…");
    expect(creatureLine(view({ mood: 20 }))).toBe("On joue ? Je m'ennuie.");
  });

  it("is stable for a given day", () => {
    const a = creatureLine(view(), "2026-09-10");
    const b = creatureLine(view(), "2026-09-10");
    expect(a).toBe(b);
    expect(a.length).toBeGreaterThan(3);
  });

  it("greets on hatch day", () => {
    expect(creatureLine(view({ ageDays: 0 }))).toContain("Coucou");
  });
});

describe("labels", () => {
  it("describes hunger", () => {
    expect(hungerLabel(0)).toBe("Repue");
    expect(hungerLabel(49)).toBe("Ça va");
    expect(hungerLabel(60)).toBe("A faim");
    expect(hungerLabel(90)).toBe("Affamée");
  });
  it("describes age", () => {
    expect(ageLabel(0)).toBe("Né·e aujourd'hui");
    expect(ageLabel(1)).toBe("1 jour");
    expect(ageLabel(12)).toBe("12 jours");
  });
});
