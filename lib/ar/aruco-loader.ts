import type { AR as ArucoNamespace } from "./vendor/aruco";

export type Aruco = typeof ArucoNamespace;

/** Loads the marker detector on demand in the browser (kept out of the initial bundle). */
export async function loadAruco(): Promise<Aruco> {
  const [{ AR }] = await Promise.all([import("./vendor/aruco.js"), import("./vendor/apriltag_36h11.js")]);
  return AR;
}
