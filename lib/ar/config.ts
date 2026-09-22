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

/**
 * Photo markers (spec § 3.19): a picture of anything (a pen drawing, a hand)
 * used instead of the printed marker. One per user, opt-in.
 */
export const PHOTO_MARKER = {
  /** Side (px) of the square the phone uploads: the centre crop of the photo. */
  uploadSize: 512,
  /**
   * Part of the photo's short side kept by default: the centre only, so the
   * marker is the object and not the table around it (a whole-width square
   * is 25–40 cm of table, which makes the creature giant and the object a
   * small part of the reference). The card lets the user widen it; never
   * below `minCropFraction` (small targets from afar would be lost).
   */
  cropFraction: 0.5,
  minCropFraction: 0.5,
  /** Largest upload the server accepts (bytes). */
  maxBytes: 1_000_000,
  /** Corners found in the picture: under `minKeypoints` it is refused, under `goodKeypoints` a warning is shown. */
  minKeypoints: 40,
  goodKeypoints: 120,
  /** How long a phone may cache another player's picture (seconds). */
  cacheSeconds: 600,
} as const;
