import { FileDown, Printer } from "lucide-react";
import { Card, CardText, CardTitle } from "@/components/ui/card";
import { AR_MARKER } from "@/lib/ar/config";
import { markerSvg } from "@/lib/ar/marker";

type MarkerCardProps = {
  name: string;
  markerId: number;
  /** The viewer's own creature: offers the PDF (the route only serves one's own markers). */
  creatureId?: string;
  ownerName?: string | null;
};

/** A creature's printed marker: preview with the name under it and, for one's own creature, the PDF to print (spec § 3.19). */
export function MarkerCard({ name, markerId, creatureId, ownerName }: MarkerCardProps) {
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
    </Card>
  );
}
