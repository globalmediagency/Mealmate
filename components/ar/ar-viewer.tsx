"use client";

import { Camera, CameraOff, Share2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { loadAruco } from "@/lib/ar/aruco-loader";
import { AR_MARKER } from "@/lib/ar/config";
import { coverTransform, CREATURE_HEIGHT_PER_MARKER, mapQuad, markerPose, smoothPose, type MarkerPose, type Quad } from "@/lib/ar/geometry";
import { cn } from "@/lib/utils/cn";
import { BillboardRenderer } from "./renderers/billboard";
import type { ArTarget } from "./types";

type Status = "idle" | "starting" | "running" | "unsupported" | "denied" | "error";

/** Frame width handed to the detector: an 8 cm marker at arm's length spans about 80 px here, enough to read its 8 cells. */
const DETECT_WIDTH = 640;
/** When one detection takes longer than this, the next frame is skipped so the video stays smooth on slower phones. */
const SLOW_DETECT_MS = 24;
/** Box the renderer draws in (CSS px) before scaling to the marker. */
const BOX = 200;
/** Ground line of the creature drawings (viewBox y ≈ 92 / 100). */
const GROUND = 0.92;
/** Marker lost for longer than this: hide its creature. */
const LOST_MS = 450;
const SMOOTHING = 0.35;

type Detector = { detect(image: { width: number; height: number; data: Uint8ClampedArray }): { id: number; corners: { x: number; y: number }[] }[] };

const shadowSize = (p: MarkerPose) => ({ w: Math.max(24, p.width * 0.8), h: Math.max(8, p.height * 0.55) });

/**
 * Camera view with every recognised creature standing on its own printed
 * marker (spec § 3.19): the viewer's, the ones boarded with them and their
 * friends'. Detection runs on a downscaled copy of each frame; creature boxes
 * are moved with `style.transform` from the animation loop, and React only
 * re-renders when a marker appears or disappears.
 */
export function ArViewer({ targets }: { targets: ArTarget[] }) {
  const [status, setStatus] = useState<Status>("idle");
  const [visible, setVisible] = useState<number[]>([]);
  const [photo, setPhoto] = useState<string | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const figures = useRef(new Map<number, HTMLDivElement>());
  const shadows = useRef(new Map<number, HTMLDivElement>());
  const work = useRef<HTMLCanvasElement | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const raf = useRef<number | null>(null);
  const detector = useRef<Detector | null>(null);
  const poses = useRef(new Map<number, MarkerPose>());
  const lastSeen = useRef(new Map<number, number>());
  const visibleRef = useRef<number[]>([]);
  const skipNext = useRef(false);
  const byMarker = useRef(new Map<number, ArTarget>());
  byMarker.current = new Map(targets.map((t) => [t.markerId, t]));

  const stop = useCallback(() => {
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
    poses.current.clear();
    lastSeen.current.clear();
    visibleRef.current = [];
    setVisible([]);
    setStatus("idle");
  }, []);

  useEffect(() => stop, [stop]);

  // The camera drains the battery: release it when the tab goes to the background.
  useEffect(() => {
    const onHide = () => {
      if (document.hidden) stop();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [stop]);

  async function start() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus("unsupported");
      return;
    }
    setStatus("starting");
    try {
      const [AR, media] = await Promise.all([
        loadAruco(),
        navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false }),
      ]);
      detector.current ??= new AR.Detector({ dictionaryName: AR_MARKER.dictionary });
      stream.current = media;
      const v = video.current!;
      v.srcObject = media;
      await v.play();
      setStatus("running");
      raf.current = requestAnimationFrame(tick);
    } catch (error) {
      console.error("[ar] cannot start", error);
      const name = error instanceof DOMException ? error.name : "";
      setStatus(name === "NotAllowedError" || name === "SecurityError" ? "denied" : "error");
    }
  }

  function tick() {
    raf.current = requestAnimationFrame(tick);
    const v = video.current;
    const container = box.current;
    if (!v || !container || v.readyState < 2 || v.videoWidth === 0) return;
    if (skipNext.current) {
      skipNext.current = false;
      return;
    }
    const canvas = (work.current ??= document.createElement("canvas"));
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
    const markers = detector.current?.detect(ctx.getImageData(0, 0, w, h)) ?? [];
    const now = performance.now();
    skipNext.current = now - started > SLOW_DETECT_MS;
    const upscale = v.videoWidth / w;
    const rect = container.getBoundingClientRect();
    const transform = coverTransform(v.videoWidth, v.videoHeight, rect.width, rect.height);

    for (const marker of markers) {
      if (marker.corners.length !== 4 || !byMarker.current.has(marker.id)) continue;
      const quad = mapQuad(marker.corners.map((c) => ({ x: c.x * upscale, y: c.y * upscale })) as unknown as Quad, transform);
      const pose = smoothPose(poses.current.get(marker.id) ?? null, markerPose(quad), SMOOTHING);
      poses.current.set(marker.id, pose);
      lastSeen.current.set(marker.id, now);
      place(marker.id, pose);
    }
    for (const [id, seen] of lastSeen.current) {
      if (now - seen > LOST_MS) {
        lastSeen.current.delete(id);
        poses.current.delete(id);
      }
    }
    const next = [...lastSeen.current.keys()].sort((a, b) => a - b);
    if (next.length !== visibleRef.current.length || next.some((id, i) => id !== visibleRef.current[i])) {
      visibleRef.current = next;
      setVisible(next);
    }
  }

  /** Writes a creature's position straight into the DOM (no React render per frame). */
  function place(id: number, p: MarkerPose) {
    const scale = (p.size * CREATURE_HEIGHT_PER_MARKER) / BOX;
    const figure = figures.current.get(id);
    if (figure) figure.style.transform = `translate(${p.center.x - BOX / 2}px, ${p.center.y - BOX * GROUND}px) scale(${scale})`;
    const shadow = shadows.current.get(id);
    if (shadow) {
      const { w, h } = shadowSize(p);
      shadow.style.transform = `translate(${p.center.x - w / 2}px, ${p.center.y - h / 2}px)`;
      shadow.style.width = `${w}px`;
      shadow.style.height = `${h}px`;
    }
  }

  // Boxes mount after their marker is seen: place them right away instead of waiting for the next frame.
  useEffect(() => {
    for (const [id, pose] of poses.current) place(id, pose);
  }, [visible]);

  /** Composes the current frame and every visible creature into a picture to save or share. */
  async function snapshot() {
    const v = video.current;
    const container = box.current;
    if (!v || !container || poses.current.size === 0) return;
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(v, 0, 0);
    const rect = container.getBoundingClientRect();
    const t = coverTransform(v.videoWidth, v.videoHeight, rect.width, rect.height);
    const toVideo = (n: number) => n / t.scale;
    // Farthest creatures first, so the nearest ones are drawn on top.
    const entries = [...poses.current.entries()].sort((a, b) => a[1].size - b[1].size);
    for (const [id, p] of entries) {
      const svg = figures.current.get(id)?.querySelector("svg");
      if (!svg) continue;
      const size = toVideo(p.size * CREATURE_HEIGHT_PER_MARKER);
      const cx = toVideo(p.center.x - t.offsetX);
      const cy = toVideo(p.center.y - t.offsetY);
      const { w, h } = shadowSize(p);
      ctx.fillStyle = "rgba(0,0,0,0.28)";
      ctx.beginPath();
      ctx.ellipse(cx, cy, toVideo(w) / 2, toVideo(h) / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml;charset=utf-8" }));
      try {
        await new Promise<void>((resolve, reject) => {
          const img = new Image();
          img.onload = () => {
            ctx.drawImage(img, cx - size / 2, cy - size * GROUND, size, size);
            resolve();
          };
          img.onerror = () => reject(new Error("svg"));
          img.src = url;
        });
      } catch {
        // A creature that fails to rasterise is simply left out of the picture.
      } finally {
        URL.revokeObjectURL(url);
      }
    }
    setPhoto(canvas.toDataURL("image/jpeg", 0.9));
  }

  async function share() {
    if (!photo) return;
    const blob = await (await fetch(photo)).blob();
    const file = new File([blob], "mealmate-en-vrai.jpg", { type: "image/jpeg" });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: "Mes créatures en vrai" });
      } catch {
        // Cancelled by the user: nothing to do.
      }
    }
  }

  const running = status === "running" || status === "starting";
  const found = visible.length > 0;

  return (
    <div className="space-y-3">
      <div
        ref={box}
        className={cn("relative aspect-[3/4] w-full overflow-hidden rounded-3xl border border-ink-600/80 bg-ink-950 shadow-card", !running && "flex items-center justify-center")}
        aria-live="polite"
      >
        <video ref={video} playsInline muted autoPlay className={cn("absolute inset-0 h-full w-full object-cover", !running && "hidden")} aria-label="Image de la caméra" />
        {running ? (
          <>
            {visible.map((id) => {
              const target = byMarker.current.get(id);
              if (!target) return null;
              return (
                <div key={id}>
                  <div
                    ref={(el) => {
                      if (el) shadows.current.set(id, el);
                      else shadows.current.delete(id);
                    }}
                    aria-hidden="true"
                    className="pointer-events-none absolute left-0 top-0 rounded-[50%] bg-ink-950/45 blur-[3px]"
                  />
                  <div
                    ref={(el) => {
                      if (el) figures.current.set(id, el);
                      else figures.current.delete(id);
                    }}
                    aria-hidden="false"
                    data-marker={id}
                    className="pointer-events-none absolute left-0 top-0 origin-[50%_92%]"
                    style={{ width: BOX, height: BOX }}
                  >
                    <BillboardRenderer creature={target.creature} size={BOX} view={0} />
                    <p className="absolute left-1/2 top-[95%] -translate-x-1/2 whitespace-nowrap rounded-full bg-ink-950/70 px-2 py-0.5 text-center text-[11px] font-semibold text-cream-50 backdrop-blur">
                      {target.creature.name}
                      {target.ownerName ? <span className="font-normal text-cream-300"> · {target.ownerName}</span> : null}
                    </p>
                  </div>
                </div>
              );
            })}
            {!found ? (
              <p className="pointer-events-none absolute inset-x-4 bottom-4 rounded-2xl bg-ink-950/70 px-4 py-2 text-center text-sm text-cream-100 backdrop-blur">
                {status === "starting" ? "Ouverture de la caméra…" : "Cadre un marqueur imprimé, bien à plat et éclairé."}
              </p>
            ) : null}
          </>
        ) : (
          <div className="flex flex-col items-center gap-3 px-6 text-center">
            {status === "unsupported" ? (
              <Alert tone="warning">Ce navigateur ne donne pas accès à la caméra. Essaie avec Chrome ou Safari, en HTTPS.</Alert>
            ) : status === "denied" ? (
              <Alert tone="warning">L&apos;accès à la caméra a été refusé. Autorise-le dans les réglages du navigateur, puis réessaie.</Alert>
            ) : status === "error" ? (
              <Alert tone="danger">Impossible d&apos;ouvrir la caméra. Ferme les autres applications qui l&apos;utilisent et réessaie.</Alert>
            ) : (
              <CameraOff className="h-10 w-10 text-cream-700" aria-hidden="true" />
            )}
            <Button onClick={start} className="w-auto px-5">
              <Camera className="h-5 w-5" aria-hidden="true" />
              {status === "idle" ? "Lancer la caméra" : "Réessayer"}
            </Button>
          </div>
        )}
      </div>

      {running ? (
        <div className="grid grid-cols-2 gap-2">
          <Button variant="brass" onClick={snapshot} disabled={!found}>
            <Camera className="h-5 w-5" aria-hidden="true" />
            Photo
          </Button>
          <Button variant="secondary" onClick={stop}>
            <CameraOff className="h-5 w-5" aria-hidden="true" />
            Arrêter
          </Button>
        </div>
      ) : null}

      {photo ? (
        <section className="space-y-3 rounded-3xl border border-ink-600/80 bg-ink-800/90 p-3 shadow-card animate-rise" aria-label="Photo prise">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo} alt="Les créatures en vrai" className="w-full rounded-2xl" />
          <div className="grid grid-cols-3 gap-2">
            <a href={photo} download="mealmate-en-vrai.jpg" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-sage-500 px-3 text-sm font-semibold text-ink-950">
              Enregistrer
            </a>
            <Button variant="secondary" onClick={share} disabled={typeof navigator === "undefined" || !navigator.share}>
              <Share2 className="h-5 w-5" aria-hidden="true" />
              Partager
            </Button>
            <Button variant="ghost" onClick={() => setPhoto(null)}>
              <X className="h-5 w-5" aria-hidden="true" />
              Fermer
            </Button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
