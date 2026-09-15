export type ArucoCorner = { x: number; y: number };
export type ArucoMarker = { id: number; corners: ArucoCorner[]; hammingDistance: number };

export class Dictionary {
  constructor(name: string);
  /** Bit strings ("0"/"1"), one per marker id. */
  codeList: string[];
  /** Marker size in cells, border included (bits side + 2). */
  markSize: number;
  nBits: number;
  tau: number;
  generateSVG(id: number): string;
}

export class Detector {
  constructor(config?: { dictionaryName?: string; maxHammingDistance?: number });
  dictionary: Dictionary;
  detect(image: { width: number; height: number; data: Uint8ClampedArray }): ArucoMarker[];
}

export const AR: { Dictionary: typeof Dictionary; Detector: typeof Detector };
