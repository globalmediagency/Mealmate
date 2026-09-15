import type { Metadata } from "next";
import { FileDown, Printer } from "lucide-react";
import Link from "next/link";
import { ArViewer } from "@/components/ar/ar-viewer";
import { Card, CardText, CardTitle } from "@/components/ui/card";
import { getOutfit, outfitToEquipped } from "@/lib/accessories/service";
import { AR_MARKER } from "@/lib/ar/config";
import { markerSvg } from "@/lib/ar/marker";
import { requireViewer } from "@/lib/auth/session";
import { getHeldCreatures } from "@/lib/boarding/service";
import { toCreatureView } from "@/lib/game/creature-view";
import { getGameRules } from "@/lib/game/rules-service";

export const metadata: Metadata = { title: "Voir en vrai" };
export const dynamic = "force-dynamic";

/** "Voir en vrai": the creature shown by the camera on a printed marker (spec § 3.19). */
export default async function ArPage() {
  const { session } = await requireViewer();
  const rules = await getGameRules();
  const now = new Date();
  const held = await getHeldCreatures(session.user.id, now, rules);
  const raw = held.own;
  const view = raw ? toCreatureView(raw, now, rules) : null;
  const ready = raw && view && view.status === "alive" && view.species && view.name && !held.away;
  const accessories = ready ? outfitToEquipped(await getOutfit(raw.id)) : [];

  return (
    <div className="space-y-5 animate-rise">
      <header>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-cream-50">Voir en vrai</h1>
        <p className="mt-1 text-sm text-cream-500">Pose le marqueur imprimé sur la table : {ready ? view.name : "ta créature"} apparaît dessus, dans l&apos;image de ta caméra.</p>
      </header>

      {ready ? (
        <ArViewer creature={{ name: view.name, speciesId: view.species!.id, stage: view.stage.id, state: view.state, accessories }} />
      ) : (
        <Card>
          <CardTitle>Pas encore de créature à montrer</CardTitle>
          <CardText className="mt-1">
            {held.away
              ? "Ta créature est en pension chez un ami : tu la reverras en vrai à son retour."
              : view?.status === "egg"
                ? "Ton œuf n'a pas encore éclos. Continue à marcher, la suite arrive !"
                : "Fais éclore et nomme ta créature, puis reviens ici."}
          </CardText>
          <Link href="/home" className="mt-3 inline-block text-sm font-semibold text-sage-300 underline">
            Retour à la créature
          </Link>
        </Card>
      )}

      <Card>
        <CardTitle>Le marqueur à imprimer</CardTitle>
        <CardText className="mt-1">
          Un carré noir de {AR_MARKER.printSizeMm / 10} cm, à imprimer une seule fois sur du papier blanc. Garde la marge blanche autour et pose-le bien à plat.
        </CardText>
        <div className="mt-4 flex items-center gap-4">
          <div className="w-28 shrink-0 rounded-xl bg-white p-1" aria-hidden="true" dangerouslySetInnerHTML={{ __html: markerSvg() }} />
          <div className="flex flex-1 flex-col gap-2">
            <a
              href="/api/ar/marker"
              target="_blank"
              rel="noopener"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-brass-400 px-4 text-sm font-semibold text-ink-950 hover:bg-brass-300"
            >
              <FileDown className="h-5 w-5" aria-hidden="true" />
              Télécharger le PDF
            </a>
            <p className="flex items-center gap-1 text-xs text-cream-700">
              <Printer className="h-3.5 w-3.5" aria-hidden="true" /> Une page A4, en noir, sans mise à l&apos;échelle.
            </p>
          </div>
        </div>
      </Card>

      <Card>
        <CardTitle>Comment ça marche</CardTitle>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm leading-relaxed text-cream-300">
          <li>Imprime le marqueur et pose-le sur une table éclairée.</li>
          <li>Lance la caméra et cadre le carré.</li>
          <li>Ta créature se tient dessus, avec ses accessoires. Approche-toi, éloigne-toi, déplace la feuille : elle suit.</li>
          <li>Prends une photo pour la garder ou la partager.</li>
        </ol>
        <p className="mt-3 text-xs text-cream-700">Les images de la caméra sont analysées sur ton téléphone et n&apos;en sortent jamais.</p>
      </Card>
    </div>
  );
}
