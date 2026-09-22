"use client";

import { Camera, Check, ImageOff, RefreshCw, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, type ChangeEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardText, CardTitle } from "@/components/ui/card";
import type { ReferenceQuality } from "@/lib/ar/features/tracker";
import type { PhotoMarkerStatus } from "@/lib/ar/photo-marker";
import { prepareMarkerImage, type PreparedMarker } from "@/lib/images/resize-client";
import { cn } from "@/lib/utils/cn";

type Draft = { prepared: PreparedMarker; quality: ReferenceQuality };
type Busy = "reading" | "saving" | "toggling" | "deleting" | null;

const QUALITY_TEXT: Record<ReferenceQuality["level"], (n: number) => string> = {
  good: (n) => `Beaucoup de détails repérés (${n}) : la caméra la reconnaîtra bien.`,
  fair: (n) => `Assez de détails (${n}), mais un motif plus contrasté serait plus fiable.`,
  poor: (n) => `Trop peu de détails (${n}) : la caméra ne pourrait pas la reconnaître. Choisis un motif plus contrasté, un dessin au stylo marche très bien.`,
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
  const input = useRef<HTMLInputElement>(null);

  function apply(next: PhotoMarkerStatus) {
    setStatus(next);
    if (!preview) router.refresh();
  }

  async function onPick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy("reading");
    setError(null);
    try {
      const prepared = await prepareMarkerImage(file);
      const { grayFromRgba, referenceQuality } = await import("@/lib/ar/features/tracker");
      const quality = referenceQuality(grayFromRgba(prepared.pixels.data, prepared.pixels.width, prepared.pixels.height));
      setDraft({ prepared, quality });
    } catch (err) {
      console.error("[photo-marker] cannot read the picture", err);
      setError("Impossible de lire cette photo. Réessaie.");
    } finally {
      setBusy(null);
    }
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
      setDraft(null);
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
        À la place du marqueur imprimé, la caméra peut reconnaître une photo prise par toi : un dessin au stylo sur une feuille, un motif, ta main… Prends-la bien à plat, de
        dessus, à la lumière, en cadrant un objet d&apos;une dizaine de centimètres. Le bas de la photo sera le devant de ta créature.
      </CardText>

      <input ref={input} type="file" accept="image/*" capture="environment" onChange={onPick} className="sr-only" tabIndex={-1} aria-hidden="true" />

      {draft ? (
        <div className="mt-4 space-y-3" data-photo-marker-draft>
          <div className="flex items-start gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={draft.prepared.previewUrl} alt="Aperçu de ta photo" className="h-28 w-28 shrink-0 rounded-2xl object-cover" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-cream-100">Voici ce que la caméra reconnaîtra.</p>
              <p className={cn("mt-1 text-sm", draft.quality.level === "poor" ? "text-brass-300" : "text-cream-300")}>{QUALITY_TEXT[draft.quality.level](draft.quality.keypoints)}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={save} disabled={busy !== null || draft.quality.level === "poor"} data-photo-marker-save>
              <Check className="h-5 w-5" aria-hidden="true" />
              {busy === "saving" ? "Enregistrement…" : "Enregistrer"}
            </Button>
            <Button variant="secondary" onClick={pick} disabled={busy !== null}>
              <RefreshCw className="h-5 w-5" aria-hidden="true" />
              Reprendre
            </Button>
          </div>
          <Button variant="ghost" onClick={() => setDraft(null)} disabled={busy !== null} className="w-auto px-4">
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
