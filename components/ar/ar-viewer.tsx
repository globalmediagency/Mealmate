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
import type { ArCreature } from "./types";

type Status = "idle" | "starting" | "running" | "unsupported" | "denied" | "error";

/** Frame width handed to the detector: small enough for 30 fps on a phone, large enough for an 8 cm marker at arm's length. */
const DETECT_WIDTH = 360;
/** Box the renderer draws in (CSS px) before scaling to the marker. */
const BOX = 200;
/** Ground line of the creature drawings (viewBox y ≈ 92 / 100). */
const GROUND = 0.92;
/** Marker lost for longer than this: hide the creature. */
const LOST_MS = 450;
const SMOOTHING = 0.35;

type Detector = { detect(image: { width: number; height: number; data: Uint8ClampedArray }): { id: number; corners: { x: number; y: number }[] }[] };

/**
 * Camera view with the creature standing on the printed marker (spec § 3.19).
 * Detection runs on a downscaled copy of each frame; the creature box is
 * moved with `style.transform` from the animation loop, never through React
 * state, so the page stays smooth on mobile.
 */
export function ArViewer({ creature }: { creature: ArCreature }) {
  const [status, setStatus] = useState<Status>("idle");
  const [found, setFound] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const figure = useRef<HTMLDivElement>(null);
  const shadow = useRef<HTMLDivElement>(null);
  const work = useRef<HTMLCanvasElement | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const raf = useRef<number | null>(null);
  const detector = useRef<Detector | null>(null);
  const pose = useRef<MarkerPose | null>(null);
  const lastSeen = useRef(0);
  const foundRef = useRef(false);

  const stop = useCallback(() => {
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
    pose.current = null;
    foundRef.current = false;
    setFound(false);
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
    const canvas = (work.current ??= document.createElement("canvas"));
    const ratio = v.videoHeight / v.videoWidth;
    const w = DETECT_WIDTH;
    const h = Math.round(DETECT_WIDTH * ratio);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    ctx.drawImage(v, 0, 0, w, h);
    const image = ctx.getImageData(0, 0, w, h);
    const marker = detector.current?.detect(image).find((m) => m.id === AR_MARKER.id);
    const now = performance.now();
    if (marker && marker.corners.length === 4) {
      const upscale = v.videoWidth / w;
      const rect = container.getBoundingClientRect();
      const transform = coverTransform(v.videoWidth, v.videoHeight, rect.width, rect.height);
      const quad = mapQuad(marker.corners.map((c) => ({ x: c.x * upscale, y: c.y * upscale })) as unknown as Quad, transform);
      pose.current = smoothPose(pose.current, markerPose(quad), SMOOTHING);
      lastSeen.current = now;
      place(pose.current);
      if (!foundRef.current) {
        foundRef.current = true;
        setFound(true);
      }
    } else if (foundRef.current && now - lastSeen.current > LOST_MS) {
      foundRef.current = false;
      pose.current = null;
      setFound(false);
    }
  }

  /** Writes the creature's position straight into the DOM (no React render per frame). */
  function place(p: MarkerPose) {
    const scale = (p.size * CREATURE_HEIGHT_PER_MARKER) / BOX;
    if (figure.current) {
      figure.current.style.transform = `translate(${p.center.x - BOX / 2}px, ${p.center.y - BOX * GROUND}px) scale(${scale})`;
    }
    if (shadow.current) {
      const w = Math.max(24, p.width * 0.8);
      const h = Math.max(8, p.height * 0.55);
      shadow.current.style.transform = `translate(${p.center.x - w / 2}px, ${p.center.y - h / 2}px)`;
      shadow.current.style.width = `${w}px`;
      shadow.current.style.height = `${h}px`;
    }
  }

  /** Composes the current frame and the creature into a picture to save or share. */
  async function snapshot() {
    const v = video.current;
    const container = box.current;
    const p = pose.current;
    const svg = figure.current?.querySelector("svg");
    if (!v || !container || !p || !svg) return;
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(v, 0, 0);
    const rect = container.getBoundingClientRect();
    const t = coverTransform(v.videoWidth, v.videoHeight, rect.width, rect.height);
    // Back from CSS px to video px.
    const toVideo = (n: number) => n / t.scale;
    const size = toVideo(p.size * CREATURE_HEIGHT_PER_MARKER);
    const cx = toVideo(p.center.x - t.offsetX);
    const cy = toVideo(p.center.y - t.offsetY);
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.beginPath();
    ctx.ellipse(cx, cy, toVideo(Math.max(24, p.width * 0.8)) / 2, toVideo(Math.max(8, p.height * 0.55)) / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    const markup = new XMLSerializer().serializeToString(svg);
    const url = URL.createObjectURL(new Blob([markup], { type: "image/svg+xml;charset=utf-8" }));
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
      setPhoto(canvas.toDataURL("image/jpeg", 0.9));
    } catch {
      setPhoto(null);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function share() {
    if (!photo) return;
    const blob = await (await fetch(photo)).blob();
    const file = new File([blob], `${creature.name ?? "creature"}-mealmate.jpg`, { type: "image/jpeg" });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: creature.name ?? "Ma créature" });
      } catch {
        // Cancelled by the user: nothing to do.
      }
    }
  }

  const running = status === "running" || status === "starting";

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
            <div
              ref={shadow}
              aria-hidden="true"
              className={cn("pointer-events-none absolute left-0 top-0 rounded-[50%] bg-ink-950/45 blur-[3px] transition-opacity duration-300", found ? "opacity-100" : "opacity-0")}
            />
            <div
              ref={figure}
              aria-hidden={!found}
              className={cn("pointer-events-none absolute left-0 top-0 origin-[50%_92%] transition-opacity duration-300", found ? "opacity-100" : "opacity-0")}
              style={{ width: BOX, height: BOX }}
            >
              <BillboardRenderer creature={creature} size={BOX} view={0} />
            </div>
            {!found ? (
              <p className="pointer-events-none absolute inset-x-4 bottom-4 rounded-2xl bg-ink-950/70 px-4 py-2 text-center text-sm text-cream-100 backdrop-blur">
                {status === "starting" ? "Ouverture de la caméra…" : "Cadre le marqueur imprimé, bien à plat et éclairé."}
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
          <img src={photo} alt={`${creature.name ?? "Ta créature"} en vrai`} className="w-full rounded-2xl" />
          <div className="grid grid-cols-3 gap-2">
            <a href={photo} download={`${creature.name ?? "creature"}-mealmate.jpg`} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-sage-500 px-3 text-sm font-semibold text-ink-950">
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
