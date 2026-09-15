import { describe, expect, it } from "vitest";
import { AR_MARKER, markerCells, markerSvg } from "./marker";

describe("marker", () => {
  it("builds an 8×8 grid with a black border around the 36 dictionary bits", () => {
    const cells = markerCells();
    expect(cells).toHaveLength(AR_MARKER.cells);
    for (const row of cells) expect(row).toHaveLength(AR_MARKER.cells);
    expect(cells[0].every(Boolean)).toBe(true);
    expect(cells[7].every(Boolean)).toBe(true);
    expect(cells.every((row) => row[0] && row[7])).toBe(true);
    const inner = cells.slice(1, 7).flatMap((row) => row.slice(1, 7));
    expect(inner).toHaveLength(36);
    expect(inner.some((b) => !b)).toBe(true);
  });

  it("is deterministic and different from another id", () => {
    expect(markerCells()).toEqual(markerCells(AR_MARKER.id));
    expect(markerCells(3)).not.toEqual(markerCells(AR_MARKER.id));
    expect(() => markerCells(9999)).toThrow();
  });

  it("renders an SVG with a white quiet zone", () => {
    const svg = markerSvg();
    expect(svg).toContain('viewBox="0 0 10 10"');
    expect(svg).toContain('fill="#fff"');
    expect((svg.match(/<rect x=/g) ?? []).length).toBeGreaterThan(28);
  });
});
