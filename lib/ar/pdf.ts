import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { AR_MARKER } from "./config";
import { markerCells } from "./marker";

const MM = 72 / 25.4;
const A4 = { width: 210 * MM, height: 297 * MM };

export type MarkerPdfInput = {
  /** AprilTag number of the creature. */
  id: number;
  /** Creature name, printed under the square. */
  name: string;
};

/** Keeps only the characters the standard font can print (accents included, emoji dropped). */
function printable(text: string, charset: ReadonlySet<number>): string {
  return [...text].filter((ch) => charset.has(ch.codePointAt(0) ?? -1)).join("").trim() || "Ma créature";
}

/** A4 sheet with one creature's marker: square, its name under it, cut line and instructions. */
export async function markerPdf({ id, name }: MarkerPdfInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const charset = new Set([...(await pdf.embedFont(StandardFonts.HelveticaBold)).getCharacterSet()]);
  const safeName = printable(name, charset);
  pdf.setTitle(`MealMate - marqueur de ${safeName}`);
  pdf.setLanguage("fr-FR");
  const page = pdf.addPage([A4.width, A4.height]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.1, 0.11, 0.1);
  const grey = rgb(0.45, 0.47, 0.45);

  page.drawText("MealMate", { x: 20 * MM, y: A4.height - 25 * MM, size: 22, font: bold, color: ink });
  page.drawText(`Marqueur de ${safeName}, pour la voir en vrai`, { x: 20 * MM, y: A4.height - 34 * MM, size: 13, font, color: ink });

  // The marker: black square of `printSizeMm`, white quiet zone of one cell around it.
  const cells = markerCells(id);
  const n = cells.length;
  const side = AR_MARKER.printSizeMm * MM;
  const cell = side / n;
  const left = (A4.width - side) / 2;
  const bottom = A4.height / 2 - side / 2 + 10 * MM;
  cells.forEach((row, y) => {
    row.forEach((black, x) => {
      if (!black) return;
      // Overlap by a hair so the printer leaves no white seams between cells.
      page.drawRectangle({ x: left + x * cell - 0.2, y: bottom + (n - 1 - y) * cell - 0.2, width: cell + 0.4, height: cell + 0.4, color: ink });
    });
  });

  // The creature's name, centred under the square.
  const nameSize = 22;
  const nameWidth = bold.widthOfTextAtSize(safeName, nameSize);
  page.drawText(safeName, { x: (A4.width - nameWidth) / 2, y: bottom - cell * 1.6 - nameSize, size: nameSize, font: bold, color: ink });

  // Cut line: a dashed square leaving the white margin the camera needs, name included.
  const margin = cell * 2.5;
  page.drawRectangle({
    x: left - margin,
    y: bottom - margin - nameSize - cell,
    width: side + margin * 2,
    height: side + margin * 2 + nameSize + cell,
    borderColor: grey,
    borderWidth: 0.6,
    borderDashArray: [4, 4],
  });
  page.drawText("Découpe le long des pointillés en gardant la marge blanche.", { x: left - margin, y: bottom - margin - nameSize - cell - 6 * MM, size: 9, font, color: grey });

  const lines = [
    "1. Imprime cette page en noir sur du papier blanc (le carré fait 8 cm de côté).",
    "2. Pose la feuille bien à plat, sur une table éclairée.",
    "3. Dans MealMate, ouvre « Voir en vrai » et lance la caméra.",
    `4. Cadre le carré : ${safeName} apparaît dessus. Déplace la feuille ou le téléphone,`,
    "    elle suit le marqueur. Les marqueurs de tes amis marchent aussi sur ton écran.",
    "",
    "Les images de la caméra restent sur ton téléphone : rien n'est envoyé.",
  ];
  lines.forEach((line, i) => {
    page.drawText(line, { x: 20 * MM, y: 52 * MM - i * 6 * MM, size: 10.5, font, color: i === lines.length - 1 ? grey : ink });
  });
  page.drawText(`Marqueur ${AR_MARKER.dictionary} n° ${id}`, { x: 20 * MM, y: 12 * MM, size: 7.5, font, color: grey });

  return pdf.save();
}
