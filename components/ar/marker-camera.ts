import { loadAruco } from "@/lib/ar/aruco-loader";
import { AR_MARKER } from "@/lib/ar/config";
import type { FrameFeatures, Quad, Reference } from "@/lib/ar/features/tracker";

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
/** Untracked photo markers searched in the whole frame per frame (the tracked ones are always followed): several friends' pictures are taken in turns. */
const PHOTO_PER_FRAME = 2;
/** A photo marker seen this recently is followed around its last place (cheap) before the whole frame is searched again. */
const PHOTO_TRACKED_MS = 1000;

type Detector = { detect(image: { width: number; height: number; data: Uint8ClampedArray }): { id: number; corners: Corner[] }[] };

/** A picture the camera recognises as marker `id` (spec § 3.19): the owner's photo marker, loaded from its same-origin URL. */
export type MarkerReference = { id: number; url: string };

type Tracker = typeof import("@/lib/ar/features/tracker");
type LoadedReference = { id: number; reference: Reference; lastSeen: number; lastQuad: Quad | null };
type PhotoTracking = { tracker: Tracker; references: LoadedReference[]; cursor: number };

/** A picture decoded for a canvas: `createImageBitmap` when it can (JPEG, PNG), an `<img>` otherwise (SVG, older browsers). */
async function decodeImage(blob: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(blob);
    } catch {
      // Fall through to the <img> element.
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

/** Decodes a picture and describes it for the tracker (the browser draws it on a canvas to read its pixels). */
async function loadReference(tracker: Tracker, url: string): Promise<Reference> {
  const response = await fetch(url, { credentials: "same-origin" });
  if (!response.ok) throw new Error(`photo marker ${response.status}`);
  const image = await decodeImage(await response.blob());
  try {
    const width = image instanceof HTMLImageElement ? image.naturalWidth : image.width;
    const height = image instanceof HTMLImageElement ? image.naturalHeight : image.height;
    if (width === 0 || height === 0) throw new Error("empty picture");
    const side = tracker.REFERENCE_SIZE;
    const canvas = document.createElement("canvas");
    canvas.width = side;
    canvas.height = side;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("canvas");
    const crop = Math.min(width, height);
    ctx.drawImage(image, (width - crop) / 2, (height - crop) / 2, crop, crop, 0, 0, side, side);
    const pixels = ctx.getImageData(0, 0, side, side);
    return tracker.buildReference(tracker.grayFromRgba(pixels.data, side, side));
  } finally {
    if ("close" in image) image.close();
  }
}

/**
 * The phone's rear camera plus the marker detector (spec § 3.19): plays the
 * stream into a video element and, every frame, hands the markers read on a
 * downscaled copy of the image to `onFrame`: the printed AprilTags, and the
 * photo markers (`references`) recognised by `lib/ar/features/tracker.ts`
 * on the same copy, reported under their owner's marker number. Shared
 * by "Voir en vrai", "Défendre" and the matches; nothing leaves the phone.
 */
export class MarkerCamera {
  onFrame: ((frame: CameraFrame) => void) | null = null;
  private detector: Detector | null = null;
  private photos: PhotoTracking | null = null;
  private stream: MediaStream | null = null;
  private raf: number | null = null;
  private work: HTMLCanvasElement | null = null;
  private skipNext = false;
  private generation = 0;

  /** `references`: photo markers to recognise besides the printed ones (a picture that fails to load is skipped). */
  constructor(
    private readonly video: HTMLVideoElement,
    private readonly references: readonly MarkerReference[] = [],
  ) {
    this.tick = this.tick.bind(this);
  }

  /** Photo markers actually loaded (for the hints and the tests). */
  get photoMarkers(): number[] {
    return this.photos?.references.map((r) => r.id) ?? [];
  }

  private async loadPhotos(): Promise<PhotoTracking | null> {
    if (this.references.length === 0) return null;
    const tracker = await import("@/lib/ar/features/tracker");
    const loaded = await Promise.all(
      this.references.map(async (ref): Promise<LoadedReference | null> => {
        try {
          return { id: ref.id, reference: await loadReference(tracker, ref.url), lastSeen: -Infinity, lastQuad: null };
        } catch (error) {
          console.warn("[ar] photo marker unavailable", ref.id, error);
          return null;
        }
      }),
    );
    const references = loaded.filter((r): r is LoadedReference => r !== null);
    return references.length > 0 ? { tracker, references, cursor: 0 } : null;
  }

  /**
   * Photo markers in this frame: the ones seen lately are followed around
   * their last place (a small region, cheap), then a few of the others are
   * searched in the whole frame, in turns. The frame's features are
   * extracted once and shared by every whole-frame search.
   */
  private detectPhotos(photos: PhotoTracking, image: ImageData, now: number): DetectedMarker[] {
    const { tracker, references } = photos;
    const frame = tracker.grayFromRgba(image.data, image.width, image.height);
    let features: FrameFeatures | null = null;
    const found: DetectedMarker[] = [];
    const searched = new Set<number>();
    const record = (ref: LoadedReference, corners: Quad) => {
      ref.lastSeen = now;
      ref.lastQuad = corners;
      found.push({ id: ref.id, corners: corners.map((c) => ({ x: c.x, y: c.y })) });
    };
    const searchWhole = (ref: LoadedReference) => {
      if (searched.has(ref.id)) return;
      searched.add(ref.id);
      features ??= tracker.extractFeatures(frame);
      const detection = tracker.findReference(features, ref.reference);
      if (detection) record(ref, detection.corners);
    };
    for (const ref of references) {
      if (!ref.lastQuad || now - ref.lastSeen >= PHOTO_TRACKED_MS) continue;
      const detection = tracker.findReference(tracker.extractFeatures(frame, { region: tracker.regionAround(ref.lastQuad) }), ref.reference);
      if (detection) record(ref, detection.corners);
      else searchWhole(ref);
    }
    let budget = PHOTO_PER_FRAME;
    for (let n = 0; n < references.length && budget > 0; n += 1) {
      const ref = references[photos.cursor % references.length];
      photos.cursor += 1;
      if (searched.has(ref.id) || found.some((f) => f.id === ref.id)) continue;
      searchWhole(ref);
      budget -= 1;
    }
    return found;
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
      const [AR, stream, photos] = await Promise.all([
        loadAruco(),
        navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false }),
        this.photos ? Promise.resolve(this.photos) : this.loadPhotos(),
      ]);
      media = stream;
      this.detector ??= new AR.Detector({ dictionaryName: AR_MARKER.dictionary });
      this.photos = photos;
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
    const image = ctx.getImageData(0, 0, w, h);
    const found = this.detector?.detect(image) ?? [];
    // Printed markers first; a photo marker never overrides a tag read with the same number.
    if (this.photos) {
      const seen = new Set(found.map((m) => m.id));
      for (const photo of this.detectPhotos(this.photos, image, started)) if (!seen.has(photo.id)) found.push(photo);
    }
    const now = performance.now();
    this.skipNext = now - started > SLOW_DETECT_MS;
    const upscale = v.videoWidth / w;
    const markers = found
      .filter((m) => m.corners.length === 4)
      .map((m) => ({ id: m.id, corners: m.corners.map((c) => ({ x: c.x * upscale, y: c.y * upscale })) }));
    this.onFrame?.({ markers, videoWidth: v.videoWidth, videoHeight: v.videoHeight, now });
  }
}
