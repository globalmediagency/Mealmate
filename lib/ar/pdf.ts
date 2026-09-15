import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { AR_MARKER, markerCells } from "./marker";

const MM = 72 / 25.4;
const A4 = { width: 210 * MM, height: 297 * MM };

/** A4 sheet with the marker to print for the "Voir en vrai" screen: square, cut line and instructions. */
export async function markerPdf(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle("MealMate - marqueur Voir en vrai");
  pdf.setLanguage("fr-FR");
  const page = pdf.addPage([A4.width, A4.height]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.1, 0.11, 0.1);
  const grey = rgb(0.45, 0.47, 0.45);

  page.drawText("MealMate", { x: 20 * MM, y: A4.height - 25 * MM, size: 22, font: bold, color: ink });
  page.drawText("Marqueur pour voir ta créature en vrai", { x: 20 * MM, y: A4.height - 34 * MM, size: 13, font, color: ink });

  // The marker: black square of `printSizeMm`, white quiet zone of one cell around it.
  const cells = markerCells();
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

  // Cut line: a dashed square leaving the white margin the camera needs.
  const margin = cell * 2.5;
  page.drawRectangle({
    x: left - margin,
    y: bottom - margin,
    width: side + margin * 2,
    height: side + margin * 2,
    borderColor: grey,
    borderWidth: 0.6,
    borderDashArray: [4, 4],
  });
  page.drawText("Découpe le long des pointillés en gardant la marge blanche.", { x: left - margin, y: bottom - margin - 6 * MM, size: 9, font, color: grey });

  const lines = [
    "1. Imprime cette page en noir sur du papier blanc (le carré fait 8 cm de côté).",
    "2. Pose la feuille bien à plat, sur une table éclairée.",
    "3. Dans MealMate, ouvre « Voir en vrai » et lance la caméra.",
    "4. Cadre le carré : ta créature apparaît dessus. Déplace la feuille ou le téléphone,",
    "    elle suit le marqueur.",
    "",
    "Les images de la caméra restent sur ton téléphone : rien n'est envoyé.",
  ];
  lines.forEach((line, i) => {
    page.drawText(line, { x: 20 * MM, y: 62 * MM - i * 6.5 * MM, size: 10.5, font, color: i === lines.length - 1 ? grey : ink });
  });
  page.drawText(`Marqueur ${AR_MARKER.dictionary} n° ${AR_MARKER.id}`, { x: 20 * MM, y: 12 * MM, size: 7.5, font, color: grey });

  return pdf.save();
}
