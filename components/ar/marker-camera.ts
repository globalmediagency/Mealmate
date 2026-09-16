import { loadAruco } from "@/lib/ar/aruco-loader";
import { AR_MARKER } from "@/lib/ar/config";

export type Corner = { x: number; y: number };
/** A marker read in a frame: its number and four corners in video pixels (top-left, top-right, bottom-right, bottom-left). */
export type DetectedMarker = { id: number; corners: Corner[] };
export type CameraFrame = { markers: DetectedMarker[]; videoWidth: number; videoHeight: number; now: number };
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

/** Frame width handed to the detector: an 8 cm marker at arm's length spans about 80 px here, enough to read its 8 cells. */
const DETECT_WIDTH = 640;
/** When one detection takes longer than this, the next frame is skipped so the video stays smooth on slower phones. */
const SLOW_DETECT_MS = 24;

type Detector = { detect(image: { width: number; height: number; data: Uint8ClampedArray }): { id: number; corners: Corner[] }[] };

/**
 * The phone's rear camera plus the marker detector (spec § 3.19): plays the
 * stream into a video element and, every frame, hands the markers read on a
 * downscaled copy of the image to `onFrame`. Shared by "Voir en vrai" and
 * "Défendre"; nothing leaves the phone.
 */
export class MarkerCamera {
  onFrame: ((frame: CameraFrame) => void) | null = null;
  private detector: Detector | null = null;
  private stream: MediaStream | null = null;
  private raf: number | null = null;
  private work: HTMLCanvasElement | null = null;
  private skipNext = false;
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
    if (this.skipNext) {
      this.skipNext = false;
      return;
    }
    const canvas = (this.work ??= document.createElement("canvas"));
    const w = DETECT_WIDTH;
    const h = Math.round((DETECT_WIDTH * v.videoHeight) / v.videoWidth);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    ctx.drawImage(v, 0, 0, w, h);
    const started = performance.now();
    const found = this.detector?.detect(ctx.getImageData(0, 0, w, h)) ?? [];
    const now = performance.now();
    this.skipNext = now - started > SLOW_DETECT_MS;
    const upscale = v.videoWidth / w;
    const markers = found
      .filter((m) => m.corners.length === 4)
      .map((m) => ({ id: m.id, corners: m.corners.map((c) => ({ x: c.x * upscale, y: c.y * upscale })) }));
    this.onFrame?.({ markers, videoWidth: v.videoWidth, videoHeight: v.videoHeight, now });
  }
}
