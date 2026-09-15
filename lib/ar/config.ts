/**
 * The printed marker of the "Voir en vrai" screen (spec § 3.19). One marker
 * for everyone: the creature shown is the viewer's own, the paper only gives
 * the camera a position. Changing `id` or `dictionary` changes the PDF and
 * the detector together. No dependency here: safe to import client-side.
 */
export const AR_MARKER = {
  dictionary: "ARUCO_MIP_36h12",
  id: 17,
  /** Printed side of the black square, in millimetres (the PDF adds a white margin). */
  printSizeMm: 80,
  /** Cells per side, black border included (6 bits + 2). */
  cells: 8,
} as const;
