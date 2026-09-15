import { AR } from "./vendor/aruco.js";

export { AR_MARKER } from "./config";
import { AR_MARKER } from "./config";

let dictionary: InstanceType<typeof AR.Dictionary> | null = null;
function getDictionary() {
  dictionary ??= new AR.Dictionary(AR_MARKER.dictionary);
  return dictionary;
}

/**
 * Cell grid of the marker, black border included: `true` = black cell.
 * Row-major, `cells × cells`.
 */
export function markerCells(id: number = AR_MARKER.id): boolean[][] {
  const dict = getDictionary();
  const code = dict.codeList[id];
  if (!code) throw new Error(`Unknown marker id ${id} for ${AR_MARKER.dictionary}`);
  const inner = dict.markSize - 2;
  const rows: boolean[][] = [];
  for (let y = 0; y < dict.markSize; y += 1) {
    const row: boolean[] = [];
    for (let x = 0; x < dict.markSize; x += 1) {
      const border = x === 0 || y === 0 || x === dict.markSize - 1 || y === dict.markSize - 1;
      // In the dictionary "1" is a white cell.
      row.push(border ? true : code[(y - 1) * inner + (x - 1)] !== "1");
    }
    rows.push(row);
  }
  return rows;
}

/** Inline SVG of the marker (white quiet zone of one cell around the black border). */
export function markerSvg(id: number = AR_MARKER.id): string {
  const cells = markerCells(id);
  const n = cells.length;
  const size = n + 2;
  const rects = cells
    .flatMap((row, y) => row.map((black, x) => (black ? `<rect x="${x + 1}" y="${y + 1}" width="1" height="1"/>` : "")))
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="#fff"/><g fill="#000">${rects}</g></svg>`;
}
