import { describe, expect, it } from "vitest";
import { custodySteps, daysLeft, holderOn } from "./custody";

const segments = [
  { hostId: "bob", from: "2026-03-05", to: "2026-03-10" },
  { hostId: "carl", from: "2026-03-20", to: null },
];

describe("holderOn", () => {
  it("gives the stay days to the host, the rest to the owner", () => {
    expect(holderOn("2026-03-04", "alice", segments)).toBe("alice");
    expect(holderOn("2026-03-05", "alice", segments)).toBe("bob"); // start day is the host's
    expect(holderOn("2026-03-09", "alice", segments)).toBe("bob");
    expect(holderOn("2026-03-10", "alice", segments)).toBe("alice"); // return day is the owner's
    expect(holderOn("2026-03-20", "alice", segments)).toBe("carl");
    expect(holderOn("2027-01-01", "alice", segments)).toBe("carl"); // open stay
    expect(holderOn("2026-03-06", "alice", [])).toBe("alice");
  });
});

describe("custodySteps", () => {
  it("only counts the holder's steps, from the hatch day on", () => {
    const rows = [
      { userId: "alice", date: "2026-03-01", steps: 1000 }, // before `since`
      { userId: "alice", date: "2026-03-04", steps: 2000 },
      { userId: "alice", date: "2026-03-06", steps: 9000 }, // away: ignored
      { userId: "bob", date: "2026-03-06", steps: 3000 },
      { userId: "bob", date: "2026-03-12", steps: 7000 }, // after the return: ignored
      { userId: "alice", date: "2026-03-12", steps: 500 },
      { userId: "carl", date: "2026-03-25", steps: 4000 },
      { userId: "carl", date: "2026-03-26", steps: -5 },
    ];
    expect(custodySteps(rows, "alice", segments, "2026-03-02")).toBe(2000 + 3000 + 500 + 4000);
    expect(custodySteps(rows, "alice", [], "2026-03-02")).toBe(2000 + 9000 + 500);
  });
});

describe("daysLeft", () => {
  it("rounds a started day up and never goes negative", () => {
    const now = new Date("2026-03-01T10:00:00Z");
    expect(daysLeft(new Date("2026-03-08T10:00:00Z"), now)).toBe(7);
    expect(daysLeft(new Date("2026-03-08T09:00:00Z"), now)).toBe(7);
    expect(daysLeft(new Date("2026-03-01T10:00:01Z"), now)).toBe(1);
    expect(daysLeft(new Date("2026-02-01T00:00:00Z"), now)).toBe(0);
  });
});
