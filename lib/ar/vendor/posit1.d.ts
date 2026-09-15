export type PositPose = {
  bestError: number;
  bestRotation: number[][];
  bestTranslation: number[];
  alternativeError: number;
  alternativeRotation: number[][];
  alternativeTranslation: number[];
};
export class Posit {
  constructor(modelSize: number, focalLength: number);
  pose(imagePoints: { x: number; y: number }[]): PositPose;
}
export const POS: { Posit: typeof Posit };
