"use client";

import { Camera, Check, ImageOff, RefreshCw, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardText, CardTitle } from "@/components/ui/card";
import { PHOTO_MARKER } from "@/lib/ar/config";
import type { ReferenceQuality } from "@/lib/ar/features/tracker";
import type { PhotoMarkerStatus } from "@/lib/ar/photo-marker";
import { cropMarkerImage, loadMarkerSource, type MarkerSource, type PreparedMarker } from "@/lib/images/resize-client";
import { cn } from "@/lib/utils/cn";

type Draft = { prepared: PreparedMarker; quality: ReferenceQuality };
/** Crop widths offered by the slider, in percent of the photo's short side. */
const CROP_MIN = Math.round(PHOTO_MARKER.minCropFraction * 100);
const CROP_MAX = 100;
const CROP_STEP = 5;
type Busy = "reading" | "saving" | "toggling" | "deleting" | null;

const QUALITY_TEXT: Record<ReferenceQuality["level"], (n: number) => string> = {
  good: (n) => `Beaucoup de détails repérés dans le carré (${n}) : la caméra le reconnaîtra bien.`,
  fair: (n) => `Assez de détails dans le carré (${n}), mais un motif plus contrasté serait plus fiable.`,
  poor: (n) => `Trop peu de détails dans le carré (${n}) : la caméra ne pourrait pas le reconnaître. Une main ou un objet uni ne marchent pas ; un dessin contrasté au stylo marche très bien.`,
};

async function call(method: "PUT" | "PATCH" | "DELETE", body?: BodyInit, json = false): Promise<PhotoMarkerStatus> {
  const response = await fetch("/api/ar/photo-marker", { method, body, headers: json ? { "Content-Type": "application/json" } : undefined });
  const data = (await response.json().catch(() => null)) as (PhotoMarkerStatus & { error?: { message?: string } }) | null;
  if (!response.ok || !data) throw new Error(data?.error?.message ?? "Une erreur est survenue. Réessaie.");
  return data;
}

const formatDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : "");

/**
 * The player's photo marker (spec § 3.19): take a picture of anything (a
 * pen drawing on a sheet, a hand…) that the camera will recognise instead
 * of the printed square; switch it on or off, replace or remove it. The
 * picture is checked on the phone before upload (enough corners to track).
 * `preview` (dev screens) keeps everything in memory.
 */
export function PhotoMarkerCard({ initial, preview = false }: { initial: PhotoMarkerStatus; preview?: boolean }) {
  const router = useRouter();
  const [status, setStatus] = useState(initial);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [cropPercent, setCropPercent] = useState(Math.round(PHOTO_MARKER.cropFraction * 100));
  /** A crop of the kept photo is being computed (the slider stays usable, saving waits). */
  const [cropping, setCropping] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  /** The decoded photo, kept while the crop is adjusted. */
  const source = useRef<MarkerSource | null>(null);
  const cropTimer = useRef<number | null>(null);
  const wantedPercent = useRef(cropPercent);

  function apply(next: PhotoMarkerStatus) {
    setStatus(next);
    if (!preview) router.refresh();
  }

  function cancelCrop() {
    if (cropTimer.current !== null) window.clearTimeout(cropTimer.current);
    cropTimer.current = null;
  }

  function releaseSource() {
    cancelCrop();
    source.current?.close();
    source.current = null;
  }

  // Unmount: drop the decoded photo and any pending crop (refs only, so the empty dependency list is right).
  useEffect(() => {
    return () => {
      if (cropTimer.current !== null) window.clearTimeout(cropTimer.current);
      cropTimer.current = null;
      source.current?.close();
      source.current = null;
    };
  }, []);

  /** Crops the kept photo and measures the crop (the part the camera will look for). */
  async function crop(percent: number): Promise<Draft> {
    const src = source.current;
    if (!src) throw new Error("no source");
    const prepared = await cropMarkerImage(src, percent / 100);
    const { grayFromRgba, referenceQuality } = await import("@/lib/ar/features/tracker");
    const quality = referenceQuality(grayFromRgba(prepared.pixels.data, prepared.pixels.width, prepared.pixels.height));
    return { prepared, quality };
  }

  async function onPick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy("reading");
    setError(null);
    let next: MarkerSource | null = null;
    try {
      // The previous photo stays until the new one is decoded: a failed "Reprendre" keeps a usable draft.
      next = await loadMarkerSource(file);
      releaseSource();
      source.current = next;
      const percent = Math.round(PHOTO_MARKER.cropFraction * 100);
      wantedPercent.current = percent;
      setCropPercent(percent);
      setDraft(await crop(percent));
    } catch (err) {
      console.error("[photo-marker] cannot read the picture", err);
      if (next && source.current === next) releaseSource();
      else next?.close();
      setError("Impossible de lire cette photo. Réessaie.");
    } finally {
      setBusy(null);
    }
  }

  /** The slider re-crops the kept photo after a short pause; an outdated crop (the slider moved again) is dropped. */
  function onCropChange(percent: number) {
    setCropPercent(percent);
    wantedPercent.current = percent;
    cancelCrop();
    setCropping(true);
    cropTimer.current = window.setTimeout(() => {
      cropTimer.current = null;
      void crop(percent)
        .then((next) => {
          if (wantedPercent.current !== percent || !source.current) return;
          setDraft((current) => (current ? next : current));
        })
        .catch((err) => console.error("[photo-marker] crop failed", err))
        .finally(() => {
          if (wantedPercent.current === percent) setCropping(false);
        });
    }, 120);
  }

  function discardDraft() {
    setDraft(null);
    setCropping(false);
    releaseSource();
  }

  async function save() {
    if (!draft || draft.quality.level === "poor") return;
    setBusy("saving");
    setError(null);
    try {
      let next: PhotoMarkerStatus;
      if (preview) next = { enabled: true, hasImage: true, updatedAt: new Date().toISOString(), imageUrl: draft.prepared.previewUrl };
      else {
        const form = new FormData();
        form.append("image", draft.prepared.blob, "marqueur.jpg");
        next = await call("PUT", form);
      }
      discardDraft();
      apply(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue. Réessaie.");
    } finally {
      setBusy(null);
    }
  }

  async function toggle() {
    if (!status.hasImage) return;
    setBusy("toggling");
    setError(null);
    try {
      apply(preview ? { ...status, enabled: !status.enabled } : await call("PATCH", JSON.stringify({ enabled: !status.enabled }), true));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue. Réessaie.");
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    setBusy("deleting");
    setError(null);
    try {
      apply(preview ? { enabled: false, hasImage: false, updatedAt: new Date().toISOString(), imageUrl: null } : await call("DELETE"));
      setConfirming(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue. Réessaie.");
    } finally {
      setBusy(null);
    }
  }

  const pick = () => input.current?.click();

  return (
    <Card data-photo-marker data-enabled={status.enabled} data-has-image={status.hasImage} data-quality={draft?.quality.level ?? ""}>
      <CardTitle>Marqueur photo</CardTitle>
      <CardText className="mt-1">
        À la place du marqueur imprimé, la caméra peut reconnaître une photo prise par toi : un dessin contrasté au stylo sur une feuille, un motif, une carte… Prends-la de
        dessus, à 20 cm environ, à la lumière. <strong className="font-semibold text-cream-100">Seul le centre de la photo est gardé</strong> (le carré de l&apos;aperçu) :
        place ton dessin au milieu pour qu&apos;il remplisse ce carré. Une main ou un objet uni ne marchent pas. Le bas de la photo sera le devant de ta créature, et sa taille
        suivra celle du carré : environ deux fois sa hauteur.
      </CardText>

      <input ref={input} type="file" accept="image/*" capture="environment" onChange={onPick} className="sr-only" tabIndex={-1} aria-hidden="true" />

      {draft ? (
        <div className="mt-4 space-y-3" data-photo-marker-draft>
          <div className="flex items-start gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={draft.prepared.previewUrl} alt="Aperçu du carré gardé" className="h-40 w-40 shrink-0 rounded-2xl object-cover ring-2 ring-sage-500/60" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-cream-100">Ce carré est ton marqueur.</p>
              <p className={cn("mt-1 text-sm", draft.quality.level === "poor" ? "text-brass-300" : "text-cream-300")}>{QUALITY_TEXT[draft.quality.level](draft.quality.keypoints)}</p>
            </div>
          </div>
          <label className="block">
            <span className="flex items-center justify-between text-sm text-cream-300">
              <span>Largeur du carré</span>
              <span className="text-xs text-cream-500">{cropPercent === CROP_MAX ? "toute la photo" : `${cropPercent} % de la photo`}</span>
            </span>
            <input
              type="range"
              min={CROP_MIN}
              max={CROP_MAX}
              step={CROP_STEP}
              value={cropPercent}
              onChange={(event) => onCropChange(Number(event.target.value))}
              disabled={busy !== null}
              data-photo-marker-crop
              className="mt-1 h-11 w-full accent-sage-500"
              aria-label="Largeur du carré gardé, en pourcentage de la photo"
            />
            <span className="block text-xs text-cream-700">
              Serré sur ton dessin (50 %) : reconnu de 12 à 60 cm environ, créature à la bonne taille. Plus large (feuille entière) : porte plus loin, moins de près. Évite les angles
              trop plats : au-delà de 45° de biais, le dessin doit être grand ou proche.
            </span>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={save} disabled={busy !== null || cropping || draft.quality.level === "poor"} data-photo-marker-save>
              <Check className="h-5 w-5" aria-hidden="true" />
              {busy === "saving" ? "Enregistrement…" : cropping ? "Recadrage…" : "Enregistrer"}
            </Button>
            <Button variant="secondary" onClick={pick} disabled={busy !== null || cropping}>
              <RefreshCw className="h-5 w-5" aria-hidden="true" />
              Reprendre
            </Button>
          </div>
          <Button variant="ghost" onClick={discardDraft} disabled={busy !== null || cropping} className="w-auto px-4">
            <X className="h-5 w-5" aria-hidden="true" />
            Annuler
          </Button>
        </div>
      ) : status.hasImage ? (
        <div className="mt-4 space-y-3">
          <div className="flex items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {status.imageUrl ? <img src={status.imageUrl} alt="Ton marqueur photo" className="h-24 w-24 shrink-0 rounded-2xl object-cover" /> : null}
            <div className="min-w-0 flex-1">
              <button
                type="button"
                role="switch"
                aria-checked={status.enabled}
                onClick={toggle}
                disabled={busy !== null}
                data-photo-marker-switch
                className="flex min-h-11 w-full items-center gap-3 rounded-2xl text-left"
              >
                <span
                  aria-hidden="true"
                  className={cn("relative h-7 w-12 shrink-0 rounded-full transition-colors", status.enabled ? "bg-sage-500" : "bg-ink-500")}
                >
                  <span className={cn("absolute top-1 h-5 w-5 rounded-full bg-cream-50 transition-transform", status.enabled ? "translate-x-6" : "translate-x-1")} />
                </span>
                <span className="text-sm font-semibold text-cream-100">{status.enabled ? "Utilisée comme marqueur" : "Mise de côté : marqueur imprimé seulement"}</span>
              </button>
              <p className="mt-1 text-xs text-cream-700">Photo enregistrée le {formatDate(status.updatedAt)}.</p>
            </div>
          </div>
          {confirming ? (
            <div className="space-y-3 rounded-2xl border border-danger/40 bg-danger/10 p-3">
              <p className="text-sm text-cream-100">Supprimer ta photo ? Ta créature apparaîtra seulement sur le marqueur imprimé.</p>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="danger" onClick={remove} disabled={busy !== null} data-photo-marker-delete-confirm>
                  {busy === "deleting" ? "Suppression…" : "Oui, supprimer"}
                </Button>
                <Button variant="ghost" onClick={() => setConfirming(false)} disabled={busy !== null}>
                  Garder
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={pick} disabled={busy !== null} data-photo-marker-replace>
                <Camera className="h-5 w-5" aria-hidden="true" />
                {busy === "reading" ? "Lecture…" : "Remplacer"}
              </Button>
              <Button variant="ghost" onClick={() => setConfirming(true)} disabled={busy !== null} data-photo-marker-delete>
                <Trash2 className="h-5 w-5" aria-hidden="true" />
                Supprimer
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <p className="flex items-center gap-2 text-sm text-cream-300">
            <ImageOff className="h-4 w-4 text-cream-700" aria-hidden="true" />
            Pas encore de photo : ta créature apparaît sur son marqueur imprimé.
          </p>
          <Button variant="brass" onClick={pick} disabled={busy !== null} data-photo-marker-take>
            <Camera className="h-5 w-5" aria-hidden="true" />
            {busy === "reading" ? "Lecture…" : "Prendre la photo"}
          </Button>
        </div>
      )}

      {error ? (
        <Alert tone="danger" className="mt-3">
          {error}
        </Alert>
      ) : null}

      <p className="mt-3 text-xs text-cream-700">
        Quand elle est utilisée, ta photo est envoyée aux téléphones de tes amis acceptés pour qu&apos;ils reconnaissent ton marqueur, comme un marqueur imprimé. Elle
        n&apos;apparaît nulle part ailleurs.
      </p>
    </Card>
  );
}
