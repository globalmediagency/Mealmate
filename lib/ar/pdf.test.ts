import { PDFArray, PDFDocument, PDFName, PDFRawStream, decodePDFRawStream } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { AR_MARKER } from "./config";
import { markerCells } from "./marker";
import { markerPdf } from "./pdf";

/** Axis-aligned rectangles drawn by the page's content stream (pdf-lib draws them as m/l paths), as `x y w h`. */
async function drawnRectangles(bytes: Uint8Array): Promise<{ x: number; y: number; w: number; h: number }[]> {
  const doc = await PDFDocument.load(bytes);
  const contents = doc.getPage(0).node.Contents();
  const streams = contents instanceof PDFArray ? contents.asArray().map((ref) => doc.context.lookup(ref) as PDFRawStream) : contents ? [contents as PDFRawStream] : [];
  const text = streams.map((s) => new TextDecoder("latin1").decode(decodePDFRawStream(s).decode())).join("\n");
  // pdf-lib translates each shape with `1 0 0 1 x y cm` then draws the path at the origin.
  const paths = [...text.matchAll(/1 0 0 1 (-?[\d.]+) (-?[\d.]+) cm\n[^Q]*?(-?[\d.]+) (-?[\d.]+) m\n((?:-?[\d.]+ -?[\d.]+ l\n)+)/g)];
  return paths.map((m) => {
    const tx = Number(m[1]);
    const ty = Number(m[2]);
    const points = [[Number(m[3]), Number(m[4])], ...[...m[5].matchAll(/(-?[\d.]+) (-?[\d.]+) l/g)].map((l) => [Number(l[1]), Number(l[2])])];
    const xs = points.map((p) => p[0] + tx);
    const ys = points.map((p) => p[1] + ty);
    return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  });
}

describe("markerPdf", () => {
  it("produces a one-page PDF", async () => {
    const bytes = await markerPdf({ id: 17, name: "Miso 🐱" });
    expect(bytes.length).toBeGreaterThan(1000);
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
    expect(doc.getTitle()).toBe("MealMate - marqueur de Miso");
    expect(doc.getPage(0).node.get(PDFName.of("MediaBox"))).toBeDefined();
  });

  it("prints exactly the detector's marker, 8 cm wide, top row at the top of the page", async () => {
    const rects = await drawnRectangles(await markerPdf({ id: 42, name: "Pipo" }));
    const mm = 72 / 25.4;
    const side = AR_MARKER.printSizeMm * mm;
    const cell = side / AR_MARKER.cells;
    // Black cells are the small squares (the cut line is the big one).
    const squares = rects.filter((r) => Math.abs(r.w - (cell + 0.4)) < 0.01 && Math.abs(r.h - (cell + 0.4)) < 0.01);
    const expected = markerCells(42);
    expect(squares).toHaveLength(expected.flat().filter(Boolean).length);
    const left = Math.min(...squares.map((r) => r.x)) + 0.2;
    const bottom = Math.min(...squares.map((r) => r.y)) + 0.2;
    const grid = expected.map((row) => row.map(() => false));
    for (const r of squares) {
      const col = Math.round((r.x + 0.2 - left) / cell);
      const rowFromBottom = Math.round((r.y + 0.2 - bottom) / cell);
      grid[AR_MARKER.cells - 1 - rowFromBottom][col] = true;
    }
    expect(grid).toEqual(expected);
    // Printed size: the outer black cells span the full side.
    expect(Math.max(...squares.map((r) => r.x + r.w)) - 0.2 - left).toBeCloseTo(side, 3);
  });
});
