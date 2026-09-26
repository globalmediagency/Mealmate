import { FileDown, Image as ImageIcon, Printer } from "lucide-react";
import { Card, CardText, CardTitle } from "@/components/ui/card";
import { AR_MARKER } from "@/lib/ar/config";
import { markerSvg } from "@/lib/ar/marker";

type MarkerCardProps = {
  name: string;
  markerId: number;
  /** The viewer's own creature: offers the PDF (the route only serves one's own markers). */
  creatureId?: string;
  ownerName?: string | null;
  /** The owner's photo marker, when they use one (spec § 3.19): shown next to the printed square. */
  photoUrl?: string | null;
  /** One line (small preview, number, PDF link): the games hub. */
  compact?: boolean;
};

/** A creature's printed marker: preview with the name under it and, for one's own creature, the PDF to print (spec § 3.19). */
export function MarkerCard({ name, markerId, creatureId, ownerName, photoUrl, compact = false }: MarkerCardProps) {
  if (compact) {
    return (
      <div className="flex min-h-14 items-center gap-3 rounded-3xl border border-ink-600/80 bg-ink-800/70 px-3 py-2" data-marker-compact={markerId}>
        <figure className="w-12 shrink-0 rounded-lg bg-white p-0.5">
          <div aria-hidden="true" dangerouslySetInnerHTML={{ __html: markerSvg(markerId) }} />
        </figure>
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoUrl} alt="Marqueur photo actif" title="Marqueur photo actif" className="h-10 w-10 shrink-0 rounded-lg object-cover ring-1 ring-sage-500/60" />
        ) : null}
        <p className="min-w-0 flex-1 text-sm leading-snug text-cream-100">
          <span className="block font-semibold">Marqueur n° {markerId}</span>
          <span className="block text-xs text-cream-500">
            {creatureId ? `Celui de ${name}, à imprimer une fois (A4, en noir).` : `${ownerName ?? "Son propriétaire"} l'imprime depuis son application.`}
          </span>
        </p>
        {creatureId ? (
          <a
            href={`/api/ar/marker?creature=${creatureId}`}
            target="_blank"
            rel="noopener"
            className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-2xl border border-brass-400/60 bg-brass-500/15 px-3 text-xs font-semibold text-brass-200 hover:bg-brass-500/25"
          >
            <FileDown className="h-4 w-4" aria-hidden="true" />
            PDF
          </a>
        ) : null}
      </div>
    );
  }
  return (
    <Card>
      <CardTitle>Le marqueur de {name}</CardTitle>
      <CardText className="mt-1">
        Un carré noir de {AR_MARKER.printSizeMm / 10} cm avec son nom dessous, à imprimer une seule fois sur du papier blanc. Garde la marge blanche et pose-le bien à plat.
      </CardText>
      <div className="mt-4 flex items-center gap-4">
        <figure className="w-28 shrink-0 rounded-xl bg-white p-1 pb-0.5 text-center">
          <div aria-hidden="true" dangerouslySetInnerHTML={{ __html: markerSvg(markerId) }} />
          <figcaption className="truncate font-display text-xs font-semibold text-ink-950">{name}</figcaption>
        </figure>
        <div className="flex flex-1 flex-col gap-2">
          {creatureId ? (
            <a
              href={`/api/ar/marker?creature=${creatureId}`}
              target="_blank"
              rel="noopener"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-brass-400 px-4 text-sm font-semibold text-ink-950 hover:bg-brass-300"
            >
              <FileDown className="h-5 w-5" aria-hidden="true" />
              Télécharger le PDF
            </a>
          ) : (
            <p className="text-sm text-cream-300">{ownerName ? `${ownerName} imprime ce marqueur depuis son application.` : "Son propriétaire imprime ce marqueur depuis son application."}</p>
          )}
          <p className="flex items-center gap-1 text-xs text-cream-700">
            <Printer className="h-3.5 w-3.5" aria-hidden="true" /> Une page A4, en noir, sans mise à l&apos;échelle · marqueur n° {markerId}
          </p>
        </div>
      </div>
      {photoUrl ? (
        <div className="mt-4 flex items-center gap-4 rounded-2xl border border-sage-500/40 bg-sage-500/10 p-3" data-photo-marker-active>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photoUrl} alt="" className="h-16 w-16 shrink-0 rounded-xl object-cover" />
          <p className="text-sm text-cream-200">
            <ImageIcon className="mr-1 inline h-4 w-4 align-text-bottom text-sage-300" aria-hidden="true" />
            {creatureId ? (
              <>Ton marqueur photo est actif : cet objet fait aussi apparaître {name}, chez toi et chez tes amis.</>
            ) : (
              <>{ownerName ?? "Son propriétaire"} utilise aussi cette photo comme marqueur : elle fait apparaître {name} sur ton écran.</>
            )}
          </p>
        </div>
      ) : null}
    </Card>
  );
}
