import { loadAruco } from "@/lib/ar/aruco-loader";
import { AR_MARKER } from "@/lib/ar/config";

export type Corner = { x: number; y: number };
/** A marker read in a frame: its number and four corners in video pixels (top-left, top-right, bottom-right, bottom-left). */
export type DetectedMarker = { id: number; corners: Corner[] };
/** `period`: milliseconds since the previous detection (0 on the first): screens scale their "marker lost" delays with it. */
export type CameraFrame = { markers: DetectedMarker[]; videoWidth: number; videoHeight: number; now: number; period: number };
export type CameraFailure = "unsupported" | "denied" | "error";

export class CameraError extends Error {
  constructor(
    readonly kind: CameraFailure,
    cause?: unknown,
  ) {
    super(`camera ${kind}`);
    this.cause = cause;
  }
}

/**
 * Pixels handed to the detector (about 640 × 480): the width follows the
 * video's shape, so a phone held upright (portrait stream) costs the same as
 * one held sideways. An 8 cm marker at arm's length still spans 50–80 px,
 * enough to read its 8 cells.
 */
const DETECT_PIXELS = 300_000;
const DETECT_MAX_WIDTH = 640;
/** A detection longer than this is followed by a rest of the same length, so the main thread is never more than half busy with it. */
const SLOW_DETECT_MS = 8;
/** A video whose `currentTime` does not move (some WebViews) is still read this often. */
const STALLED_CLOCK_MS = 100;

type Detector = { detect(image: { width: number; height: number; data: Uint8ClampedArray }): { id: number; corners: Corner[] }[] };

/**
 * The phone's rear camera plus the marker detector (spec § 3.19): plays the
 * stream into a video element and, at every detection, hands the printed
 * AprilTags read on a downscaled copy of the image to `onFrame`. Shared by
 * "Voir en vrai", "Défendre" and the matches; nothing leaves the phone.
 */
export class MarkerCamera {
  onFrame: ((frame: CameraFrame) => void) | null = null;
  private detector: Detector | null = null;
  private stream: MediaStream | null = null;
  private raf: number | null = null;
  private work: HTMLCanvasElement | null = null;
  private nextDetectAt = 0;
  private lastFrameTime = -1;
  private lastStarted = 0;
  private generation = 0;

  constructor(private readonly video: HTMLVideoElement) {
    this.tick = this.tick.bind(this);
  }

  get running(): boolean {
    return this.stream !== null;
  }

  /** Opens the camera and starts detecting. Resolves to false when `stop()` was called meanwhile. Throws a `CameraError`. */
  async start(): Promise<boolean> {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) throw new CameraError("unsupported");
    const generation = ++this.generation;
    let media: MediaStream;
    try {
      const [AR, stream] = await Promise.all([
        loadAruco(),
        navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false }),
      ]);
      media = stream;
      this.detector ??= new AR.Detector({ dictionaryName: AR_MARKER.dictionary });
    } catch (error) {
      const name = error instanceof DOMException ? error.name : "";
      throw new CameraError(name === "NotAllowedError" || name === "SecurityError" ? "denied" : "error", error);
    }
    if (generation !== this.generation) {
      media.getTracks().forEach((t) => t.stop());
      return false;
    }
    this.stream = media;
    this.video.srcObject = media;
    try {
      await this.video.play();
    } catch (error) {
      this.stop();
      throw new CameraError("error", error);
    }
    if (generation !== this.generation) return false;
    this.raf = requestAnimationFrame(this.tick);
    return true;
  }

  stop() {
    this.generation += 1;
    this.lastFrameTime = -1;
    this.lastStarted = 0;
    this.nextDetectAt = 0;
    if (this.raf !== null) cancelAnimationFrame(this.raf);
    this.raf = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.video.srcObject = null;
  }

  private tick() {
    this.raf = requestAnimationFrame(this.tick);
    const v = this.video;
    if (v.readyState < 2 || v.videoWidth === 0) return;
    if (performance.now() < this.nextDetectAt) return;
    // A 30 fps camera under a 60 Hz loop: the same picture is never read twice (a stream whose clock stands still is still read ten times a second).
    if (v.currentTime === this.lastFrameTime && performance.now() - this.lastStarted < STALLED_CLOCK_MS) return;
    this.lastFrameTime = v.currentTime;
    const canvas = (this.work ??= document.createElement("canvas"));
    const w = Math.min(DETECT_MAX_WIDTH, Math.round(Math.sqrt((DETECT_PIXELS * v.videoWidth) / v.videoHeight) / 8) * 8);
    const h = Math.round((w * v.videoHeight) / v.videoWidth);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    ctx.drawImage(v, 0, 0, w, h);
    const started = performance.now();
    const period = this.lastStarted > 0 ? started - this.lastStarted : 0;
    this.lastStarted = started;
    const found = this.detector?.detect(ctx.getImageData(0, 0, w, h)) ?? [];
    const now = performance.now();
    const upscale = v.videoWidth / w;
    const markers = found.filter((m) => m.corners.length === 4).map((m) => ({ id: m.id, corners: m.corners.map((c) => ({ x: c.x * upscale, y: c.y * upscale })) }));
    this.onFrame?.({ markers, videoWidth: v.videoWidth, videoHeight: v.videoHeight, now, period });
    // A slow detection (the screen's own work in onFrame included) earns a rest of the same length: never more than half of the main thread.
    const elapsed = performance.now() - started;
    this.nextDetectAt = elapsed > SLOW_DETECT_MS ? performance.now() + elapsed : 0;
  }
}
