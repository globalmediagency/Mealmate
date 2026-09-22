import { describe, expect, it } from "vitest";
import { detectFast } from "./fast";
import { fitHomography, isSaneQuad, ransacHomography, type Quad } from "./homography";
import { blur, grayFromRgba, halve, mat3Invert, project, warpOnto, type GrayImage, type Mat3 } from "./image";
import { hamming, matchDescriptors, popcount32 } from "./match";
import { buildReference, consistentMatches, detectReferences, extractFeatures, findReference, homographyToQuad, REFERENCE_SIZE, referenceQuality, regionAround } from "./tracker";

function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const flat = (width: number, height: number, value: number): GrayImage => ({ width, height, data: new Uint8Array(width * height).fill(value) });

/** A fake pen drawing: dark rectangles and thick strokes on a light sheet, slightly blurred like a photo. */
function synthDrawing(seed: number, size = REFERENCE_SIZE): GrayImage {
  const random = mulberry32(seed);
  const img = flat(size, size, 235);
  const rect = (x: number, y: number, w: number, h: number, v: number) => {
    for (let yy = Math.max(0, y); yy < Math.min(size, y + h); yy += 1) for (let xx = Math.max(0, x); xx < Math.min(size, x + w); xx += 1) img.data[yy * size + xx] = v;
  };
  for (let i = 0; i < 45; i += 1) rect(Math.floor(random() * size), Math.floor(random() * size), 6 + Math.floor(random() * 34), 6 + Math.floor(random() * 34), 20 + Math.floor(random() * 120));
  for (let i = 0; i < 25; i += 1) {
    const x0 = random() * size;
    const y0 = random() * size;
    const x1 = random() * size;
    const y1 = random() * size;
    const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0));
    for (let s = 0; s <= steps; s += 1) rect(Math.round(x0 + ((x1 - x0) * s) / steps) - 1, Math.round(y0 + ((y1 - y0) * s) / steps) - 1, 3, 3, 30);
  }
  return blur(img);
}

/** A camera frame: light table with noise, the drawing pasted through the homography sending the reference square onto `quad`. */
function synthFrame(drawing: GrayImage, quad: Quad, seed = 7, width = 320, height = 240): { frame: GrayImage; H: Mat3 } {
  const random = mulberry32(seed);
  const frame = flat(width, height, 205);
  for (let i = 0; i < frame.data.length; i += 1) frame.data[i] = Math.max(0, Math.min(255, frame.data[i] + Math.round((random() - 0.5) * 12)));
  const H = homographyToQuad(drawing.width, quad);
  if (!H) throw new Error("bad quad");
  warpOnto(drawing, H, frame);
  return { frame, H };
}

const near = (found: Quad, expected: Quad, tolerance: number) => found.every((c, i) => Math.hypot(c.x - expected[i].x, c.y - expected[i].y) <= tolerance);

const square = (cx: number, cy: number, side: number, degrees: number): Quad => {
  const a = (degrees * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const h = side / 2;
  const at = (x: number, y: number) => ({ x: cx + x * cos - y * sin, y: cy + x * sin + y * cos });
  return [at(-h, -h), at(h, -h), at(h, h), at(-h, h)];
};

describe("photo-marker features", () => {
  it("counts bits and Hamming distances", () => {
    expect(popcount32(0)).toBe(0);
    expect(popcount32(0xffffffff)).toBe(32);
    expect(popcount32(0x80000001)).toBe(2);
    const a = Uint32Array.of(0xff, 0, 0, 0, 0, 0, 0, 1);
    const b = Uint32Array.of(0x0f, 0, 0, 0, 0, 0, 0, 0);
    expect(hamming(a, 0, b, 0)).toBe(5);
  });

  it("finds the corners of a square and nothing on a flat sheet", () => {
    const img = flat(80, 80, 30);
    for (let y = 20; y < 60; y += 1) for (let x = 20; x < 60; x += 1) img.data[y * 80 + x] = 220;
    const points = detectFast(img, 20, 3);
    expect(points.length).toBeGreaterThanOrEqual(4);
    for (const corner of [
      [20, 20],
      [59, 20],
      [59, 59],
      [20, 59],
    ]) {
      expect(points.some((p) => Math.abs(p.x - corner[0]) <= 2 && Math.abs(p.y - corner[1]) <= 2)).toBe(true);
    }
    expect(detectFast(flat(80, 80, 120), 20)).toHaveLength(0);
    expect(referenceQuality(flat(300, 200, 90)).level).toBe("poor");
    expect(referenceQuality(synthDrawing(1)).level).toBe("good");
  });

  it("fits a homography exactly from four points and robustly among outliers", () => {
    const quad: Quad = [
      { x: 50, y: 30 },
      { x: 250, y: 40 },
      { x: 240, y: 200 },
      { x: 60, y: 210 },
    ];
    const H = homographyToQuad(100, quad);
    expect(H).not.toBeNull();
    const p = project(H!, 100, 100);
    expect(p.x).toBeCloseTo(240, 6);
    expect(p.y).toBeCloseTo(200, 6);
    const inverse = mat3Invert(H!)!;
    const back = project(inverse, 250, 40);
    expect(back.x).toBeCloseTo(100, 6);
    expect(back.y).toBeCloseTo(0, 6);
    expect(isSaneQuad(quad)).toBe(true);
    expect(isSaneQuad([quad[1], quad[0], quad[3], quad[2]])).toBe(false); // mirrored
    expect(isSaneQuad([quad[0], quad[2], quad[1], quad[3]])).toBe(false); // bow-tie

    const random = mulberry32(3);
    const count = 60;
    const src = new Float32Array(count * 2);
    const dst = new Float32Array(count * 2);
    for (let i = 0; i < count; i += 1) {
      src[2 * i] = random() * 100;
      src[2 * i + 1] = random() * 100;
      const q = project(H!, src[2 * i], src[2 * i + 1]);
      const outlier = i % 3 === 0;
      dst[2 * i] = outlier ? random() * 300 : q.x + (random() - 0.5) * 1.5;
      dst[2 * i + 1] = outlier ? random() * 240 : q.y + (random() - 0.5) * 1.5;
    }
    const result = ransacHomography(src, dst, count, { threshold: 3, random: mulberry32(11) });
    expect(result).not.toBeNull();
    expect(result!.inliers.length).toBeGreaterThanOrEqual(38);
    const exact = fitHomography(src, dst, result!.inliers)!;
    const check = project(exact, 50, 50);
    const truth = project(H!, 50, 50);
    expect(Math.hypot(check.x - truth.x, check.y - truth.y)).toBeLessThan(1.5);
  });

  it("recognises the drawing seen at an angle, its corners in marker order", () => {
    const drawing = synthDrawing(1);
    const reference = buildReference(drawing);
    expect(reference.count).toBeGreaterThan(300);
    expect(reference.keypoints).toBeGreaterThan(120);
    const quad: Quad = [
      { x: 70, y: 40 },
      { x: 240, y: 48 },
      { x: 250, y: 200 },
      { x: 60, y: 195 },
    ];
    const { frame } = synthFrame(drawing, quad);
    const [found] = detectReferences(frame, [reference], { random: mulberry32(5) });
    expect(found).not.toBeNull();
    expect(found!.inliers).toBeGreaterThanOrEqual(20);
    expect(near(found!.corners, quad, 3)).toBe(true);
  });

  it("copes with rotation, a small target and a strong tilt", () => {
    const drawing = synthDrawing(2);
    const reference = buildReference(drawing);
    const rotated = square(160, 120, 110, 35);
    const small = synthFrame(drawing, rotated, 9);
    const [foundSmall] = detectReferences(small.frame, [reference], { random: mulberry32(6) });
    expect(foundSmall).not.toBeNull();
    expect(near(foundSmall!.corners, rotated, 3)).toBe(true);

    const tilted: Quad = [
      { x: 110, y: 60 },
      { x: 210, y: 60 },
      { x: 262, y: 200 },
      { x: 58, y: 200 },
    ];
    const tilt = synthFrame(drawing, tilted, 10);
    const [foundTilted] = detectReferences(tilt.frame, [reference], { random: mulberry32(8) });
    expect(foundTilted).not.toBeNull();
    expect(near(foundTilted!.corners, tilted, 4)).toBe(true);
  });

  it("tells two drawings apart in one frame and ignores an absent one", () => {
    const a = synthDrawing(21);
    const b = synthDrawing(22);
    const other = synthDrawing(23);
    const refs = [buildReference(a), buildReference(b), buildReference(other)];
    const left: Quad = [
      { x: 20, y: 60 },
      { x: 140, y: 64 },
      { x: 142, y: 184 },
      { x: 18, y: 180 },
    ];
    const right: Quad = [
      { x: 175, y: 50 },
      { x: 300, y: 56 },
      { x: 296, y: 190 },
      { x: 180, y: 182 },
    ];
    const { frame } = synthFrame(a, left, 12);
    const H = homographyToQuad(b.width, right)!;
    warpOnto(b, H, frame);
    const features = extractFeatures(frame);
    const foundA = findReference(features, refs[0], { random: mulberry32(1) });
    const foundB = findReference(features, refs[1], { random: mulberry32(2) });
    const foundOther = findReference(features, refs[2], { random: mulberry32(3) });
    expect(foundA).not.toBeNull();
    expect(foundB).not.toBeNull();
    expect(near(foundA!.corners, left, 3)).toBe(true);
    expect(near(foundB!.corners, right, 3)).toBe(true);
    expect(foundOther).toBeNull();
    expect(detectReferences(flat(320, 240, 128), refs)).toEqual([null, null, null]);
  });

  it("finds a drawing seen larger than its photo (phone closer) through the frame pyramid, then follows it in a region", () => {
    const drawing = synthDrawing(31);
    const reference = buildReference(drawing);
    // 1.8 × the reference: a 460 px square in a 640 × 480 frame.
    const big: Quad = [
      { x: 90, y: 10 },
      { x: 550, y: 20 },
      { x: 560, y: 470 },
      { x: 80, y: 460 },
    ];
    const { frame } = synthFrame(drawing, big, 14, 640, 480);
    const [found] = detectReferences(frame, [reference], { random: mulberry32(4) });
    expect(found).not.toBeNull();
    expect(near(found!.corners, big, 4)).toBe(true);
    // Without the smaller levels the same frame is lost: the pyramid is what covers it.
    const flat = extractFeatures(frame, { levels: [{ scale: 1, max: 400 }] });
    expect(findReference(flat, reference, { random: mulberry32(4) })).toBeNull();
    // Region tracking around the last quad finds it again with fewer corners to describe.
    const region = regionAround(found!.corners);
    const tracked = extractFeatures(frame, { region });
    expect(tracked.count).toBeGreaterThan(0);
    expect(tracked.points.every((pt) => pt.x >= region.x - 1 && pt.y >= region.y - 1)).toBe(true);
    const again = findReference(tracked, reference, { random: mulberry32(5) });
    expect(again).not.toBeNull();
    expect(near(again!.corners, big, 4)).toBe(true);
  });

  it("keeps a small drawing on a cluttered table (no low-threshold flood of noise corners)", () => {
    const drawing = synthDrawing(41);
    const reference = buildReference(drawing);
    const table = synthDrawing(77, 640);
    const frame: GrayImage = { width: 640, height: 480, data: table.data.slice(0, 640 * 480) };
    const small = square(320, 250, 110, 12);
    const H = homographyToQuad(drawing.width, small)!;
    warpOnto(drawing, H, frame);
    const [found] = detectReferences(frame, [reference], { random: mulberry32(6) });
    expect(found).not.toBeNull();
    expect(found!.inliers).toBeGreaterThanOrEqual(20);
    expect(near(found!.corners, small, 6)).toBe(true);
    // The agreement filter is what saves it: the clutter matches the drawing's own kind of strokes.
    const features = extractFeatures(frame);
    const all = matchDescriptors(features.descriptors, features.count, reference.descriptors, reference.count, reference.positions, { sameSpot: reference.size * 0.04 });
    const agreeing = consistentMatches(all, features, reference);
    expect(agreeing.length).toBeLessThan(all.length * 0.6);
    expect(agreeing.length).toBeGreaterThanOrEqual(30);
  });

  it("converts and halves pixel buffers", () => {
    const rgba = new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255, 255, 0, 0, 255, 0, 0, 255, 255]);
    const gray = grayFromRgba(rgba, 2, 2);
    expect([...gray.data]).toEqual([255, 0, 76, 27]);
    const half = halve(gray);
    expect(half.width).toBe(1);
    expect(half.data[0]).toBe((255 + 0 + 76 + 27 + 2) >> 2);
  });
});
