import { loadAruco } from "@/lib/ar/aruco-loader";
import { AR_MARKER } from "@/lib/ar/config";
import type { FrameFeatures, Quad, Reference } from "@/lib/ar/features/tracker";

export type Corner = { x: number; y: number };
/** A marker read in a frame: its number and four corners in video pixels (top-left, top-right, bottom-right, bottom-left). */
export type DetectedMarker = { id: number; corners: Corner[]; source?: "tag" | "photo" };
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
/** Photo markers not in view searched in the whole frame per search: several friends' pictures are taken in turns. */
const PHOTO_PER_SEARCH = 1;
/** Whole-frame searches: this often while some picture was seen lately, rarer when none was (`PHOTO_SEARCH_IDLE_MS`), never faster than twice their own cost. */
const PHOTO_SEARCH_MS = 250;
const PHOTO_SEARCH_IDLE_MS = 1000;
const PHOTO_RECENT_MS = 3000;
/** A photo marker seen this recently (or within three detections on a slow phone) is followed around its last place before the whole frame is searched again. */
const PHOTO_TRACKED_MS = 1000;
/** Photo detection that throws this many times switches itself off; printed tags keep working. */
const PHOTO_MAX_FAILURES = 3;
/** A video whose `currentTime` does not move (some WebViews) is still read this often. */
const STALLED_CLOCK_MS = 100;

type Detector = { detect(image: { width: number; height: number; data: Uint8ClampedArray }): { id: number; corners: Corner[] }[] };

/** A picture the camera recognises as marker `id` (spec § 3.19): the owner's photo marker, loaded from its same-origin URL. */
export type MarkerReference = { id: number; url: string };

/** What the screen may tell about a photo marker: loaded or not, and when it was last recognised. */
export type PhotoMarkerState = {
  id: number;
  state: "loading" | "ready" | "failed";
  /** Why it failed (HTTP status, decoding…). */
  detail?: string;
  /** Corners described at the base scale: the picture's richness in detail. */
  keypoints?: number;
  /** `performance.now()` of the last recognition, −Infinity if never. */
  lastSeen: number;
  lastInliers: number;
};

type Tracker = typeof import("@/lib/ar/features/tracker");
type LoadedReference = { id: number; reference: Reference; state: PhotoMarkerState; lastQuad: Quad | null };
type PhotoTracking = { tracker: Tracker; references: LoadedReference[]; cursor: number; lastSearchAt: number; searchCost: number; failures: number };

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
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const image = await decodeImage(await response.blob());
  try {
    const width = image instanceof HTMLImageElement ? image.naturalWidth : image.width;
    const height = image instanceof HTMLImageElement ? image.naturalHeight : image.height;
    if (width === 0 || height === 0) throw new Error("image vide");
    const side = tracker.REFERENCE_SIZE;
    const canvas = document.createElement("canvas");
    canvas.width = side;
    canvas.height = side;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("canvas");
    const crop = Math.min(width, height);
    ctx.drawImage(image, (width - crop) / 2, (height - crop) / 2, crop, crop, 0, 0, side, side);
    const pixels = ctx.getImageData(0, 0, side, side);
    // Describing takes a good tenth of a second on a phone: let a frame through before each picture.
    await new Promise((resolve) => setTimeout(resolve, 0));
    return tracker.buildReference(tracker.grayFromRgba(pixels.data, side, side));
  } finally {
    if ("close" in image) image.close();
  }
}

const referencesKey = (refs: readonly MarkerReference[]) => refs.map((r) => `${r.id}:${r.url}`).join("|");

/**
 * The phone's rear camera plus the marker detector (spec § 3.19): plays the
 * stream into a video element and, at every detection, hands the markers
 * read on a downscaled copy of the image to `onFrame`: the printed AprilTags,
 * and the photo markers (`references`) recognised by
 * `lib/ar/features/tracker.ts` on the same copy, reported under their
 * owner's marker number. Pictures load in the background once the video
 * runs; `photoStatus()` tells the screen how each one fares. Shared by
 * "Voir en vrai", "Défendre" and the matches; nothing leaves the phone.
 */
export class MarkerCamera {
  onFrame: ((frame: CameraFrame) => void) | null = null;
  private detector: Detector | null = null;
  private photos: PhotoTracking | null = null;
  private photoStates = new Map<number, PhotoMarkerState>();
  private photoLoad = 0;
  private requestedFor = "";
  private references: MarkerReference[];
  private stream: MediaStream | null = null;
  private raf: number | null = null;
  private work: HTMLCanvasElement | null = null;
  private nextDetectAt = 0;
  private lastFrameTime = -1;
  private lastStarted = 0;
  private generation = 0;

  /** `references`: photo markers to recognise besides the printed ones (a picture that fails to load is reported by `photoStatus()`). */
  constructor(
    private readonly video: HTMLVideoElement,
    references: readonly MarkerReference[] = [],
  ) {
    this.references = [...references];
    this.tick = this.tick.bind(this);
  }

  get running(): boolean {
    return this.stream !== null;
  }

  /** Photo markers actually loaded (for the hints and the tests). */
  get photoMarkers(): number[] {
    return [...this.photoStates.values()].filter((s) => s.state === "ready").map((s) => s.id);
  }

  /** How each photo marker fares, by number. */
  photoStatus(): PhotoMarkerState[] {
    return [...this.photoStates.values()].sort((a, b) => a.id - b.id);
  }

  /** Replaces the pictures to recognise (a photo saved or switched while the camera runs); they load in the background. */
  setReferences(references: readonly MarkerReference[]): void {
    this.references = [...references];
    if (this.stream) void this.loadPhotos();
  }

  private async loadPhotos(): Promise<void> {
    const key = referencesKey(this.references);
    // Already loaded (or loading) for these pictures: nothing to do, unless every picture had failed (a restart retries).
    if (key === this.requestedFor && (this.photos !== null || this.references.length === 0)) return;
    this.requestedFor = key;
    const load = ++this.photoLoad;
    const generation = this.generation;
    const refs = this.references;
    this.photoStates = new Map(refs.map((r) => [r.id, { id: r.id, state: "loading", lastSeen: -Infinity, lastInliers: 0 } satisfies PhotoMarkerState]));
    if (refs.length === 0) {
      this.photos = null;
      return;
    }
    let tracker: Tracker;
    try {
      tracker = await import("@/lib/ar/features/tracker");
    } catch (error) {
      console.error("[ar] photo tracker unavailable", error);
      for (const state of this.photoStates.values()) Object.assign(state, { state: "failed", detail: "module" });
      this.photos = null;
      return;
    }
    const loaded = await Promise.all(
      refs.map(async (ref): Promise<LoadedReference | null> => {
        const state = this.photoStates.get(ref.id)!;
        try {
          const reference = await loadReference(tracker, ref.url);
          return { id: ref.id, reference, state, lastQuad: null };
        } catch (error) {
          console.warn("[ar] photo marker unavailable", ref.id, error);
          state.state = "failed";
          state.detail = error instanceof Error ? error.message : String(error);
          return null;
        }
      }),
    );
    if (load !== this.photoLoad || generation !== this.generation) return; // superseded by a newer load or a stop
    const references = loaded.filter((r): r is LoadedReference => r !== null);
    for (const r of references) {
      r.state.state = "ready";
      r.state.keypoints = r.reference.keypoints;
    }
    this.photos = references.length > 0 ? { tracker, references, cursor: 0, lastSearchAt: -Infinity, searchCost: 0, failures: 0 } : null;
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
    // The pictures load while the video already runs: printed tags never wait for the network.
    void this.loadPhotos();
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

  /**
   * Photo markers in this frame: the ones seen lately (within a second, or
   * three detections on a slow phone) are followed around their last place
   * with small budgets; the others are searched in the whole frame one at a
   * time, in turns, at most every `PHOTO_SEARCH_MS` (rarer when nothing was
   * seen for a while, and never faster than twice the cost of a search, so
   * cheap tag-only detections always fit in between). The frame's features
   * are extracted once and shared by every whole-frame search. A number
   * already read as a printed tag is not searched.
   */
  private detectPhotos(photos: PhotoTracking, image: ImageData, now: number, seen: ReadonlySet<number>, period: number): DetectedMarker[] {
    const { tracker, references } = photos;
    const trackedFor = Math.max(PHOTO_TRACKED_MS, 3 * period);
    const frame = tracker.grayFromRgba(image.data, image.width, image.height);
    let features: FrameFeatures | null = null;
    const found: DetectedMarker[] = [];
    const searched = new Set<number>();
    const record = (ref: LoadedReference, corners: Quad, inliers: number) => {
      ref.state.lastSeen = now;
      ref.state.lastInliers = inliers;
      ref.lastQuad = corners;
      found.push({ id: ref.id, corners: corners.map((c) => ({ x: c.x, y: c.y })), source: "photo" });
    };
    const searchWhole = (ref: LoadedReference) => {
      if (searched.has(ref.id)) return;
      searched.add(ref.id);
      features ??= tracker.extractFeatures(frame);
      const detection = tracker.findReference(features, ref.reference);
      if (detection) record(ref, detection.corners, detection.inliers);
    };
    for (const ref of references) {
      if (seen.has(ref.id) || !ref.lastQuad || now - ref.state.lastSeen >= trackedFor) continue;
      const detection = tracker.findReference(tracker.extractFeatures(frame, { region: tracker.regionAround(ref.lastQuad), levels: tracker.REGION_LEVELS }), ref.reference);
      if (detection) record(ref, detection.corners, detection.inliers);
      else searchWhole(ref);
    }
    const recent = references.some((r) => now - r.state.lastSeen < PHOTO_RECENT_MS);
    const searchEvery = Math.max(recent ? PHOTO_SEARCH_MS : PHOTO_SEARCH_IDLE_MS, 2 * photos.searchCost);
    if (now - photos.lastSearchAt >= searchEvery) {
      const searchStarted = performance.now();
      let budget = PHOTO_PER_SEARCH;
      for (let n = 0; n < references.length && budget > 0; n += 1) {
        const ref = references[photos.cursor % references.length];
        photos.cursor += 1;
        if (seen.has(ref.id) || searched.has(ref.id) || found.some((f) => f.id === ref.id)) continue;
        searchWhole(ref);
        budget -= 1;
      }
      photos.searchCost = performance.now() - searchStarted;
      photos.lastSearchAt = performance.now();
    }
    return found;
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
    const image = ctx.getImageData(0, 0, w, h);
    const found: DetectedMarker[] = (this.detector?.detect(image) ?? []).map((m) => ({ id: m.id, corners: m.corners, source: "tag" as const }));
    // Printed markers first; a photo marker never overrides a tag read with the same number.
    const photos = this.photos;
    if (photos) {
      const seen = new Set(found.map((m) => m.id));
      try {
        for (const photo of this.detectPhotos(photos, image, started, seen, period)) if (!seen.has(photo.id)) found.push(photo);
      } catch (error) {
        photos.failures += 1;
        console.error("[ar] photo detection failed", error);
        if (photos.failures >= PHOTO_MAX_FAILURES) {
          for (const ref of photos.references) Object.assign(ref.state, { state: "failed", detail: "erreur interne" });
          this.photos = null;
        }
      }
    }
    const now = performance.now();
    const upscale = v.videoWidth / w;
    const markers = found
      .filter((m) => m.corners.length === 4)
      .map((m) => ({ id: m.id, source: m.source, corners: m.corners.map((c) => ({ x: c.x * upscale, y: c.y * upscale })) }));
    this.onFrame?.({ markers, videoWidth: v.videoWidth, videoHeight: v.videoHeight, now, period });
    // A slow detection (the screen's own work in onFrame included) earns a rest of the same length: never more than half of the main thread.
    const elapsed = performance.now() - started;
    this.nextDetectAt = elapsed > SLOW_DETECT_MS ? performance.now() + elapsed : 0;
  }
}
