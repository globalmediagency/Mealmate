/**
 * Printed markers of the "Voir en vrai" screen (spec § 3.19). Every creature
 * gets its own marker number (`creatures.ar_marker`), drawn from the AprilTag
 * 36h11 dictionary: 587 codes, 11 bits of Hamming distance between any two,
 * so a misread never turns one creature into another. No dependency here:
 * safe to import client-side.
 */
export const AR_MARKER = {
  dictionary: "APRILTAG_36h11",
  /** Number of codes in the dictionary: marker numbers go from 0 to `ids − 1`. */
  ids: 587,
  /** Printed side of the black square, in millimetres (the PDF adds a white margin). */
  printSizeMm: 80,
  /** Cells per side, black border included (6 bits + 2). */
  cells: 8,
} as const;

export function isMarkerId(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value < AR_MARKER.ids;
}
