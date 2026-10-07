import type { Metadata } from "next";
import { ChevronRight, Gamepad2 } from "lucide-react";
import Link from "next/link";
import { ArViewer } from "@/components/ar/ar-viewer";
import { MarkerCard } from "@/components/ar/marker-card";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardText, CardTitle } from "@/components/ui/card";
import { listArTargets } from "@/lib/ar/service";
import { requireViewer } from "@/lib/auth/session";
import { getGameRules } from "@/lib/game/rules-service";

export const metadata: Metadata = { title: "Voir en vrai" };
export const dynamic = "force-dynamic";

/** "Voir en vrai": every recognised creature shown by the camera on its own printed marker (spec § 3.19). */
export default async function ArPage() {
  const { session } = await requireViewer();
  const rules = await getGameRules();
  const { targets, own, conflicts } = await listArTargets(session.user.id, new Date(), rules);
  const others = targets.filter((t) => !t.mine);

  return (
    <div className="space-y-5 animate-rise">
      <PageHeader
        title="Voir en vrai"
        subtitle="Pose le marqueur imprimé sur la table : ta créature apparaît dessus, dans ta caméra."
        back={{ href: "/home", label: "Retour à ma créature" }}
      />

      {targets.length > 0 ? (
        <ArViewer targets={targets} creatureHeight={rules.ar.creatureHeight} />
      ) : (
        <Card>
          <CardTitle>Pas encore de créature à montrer</CardTitle>
          <CardText className="mt-1">Fais éclore et nomme ta créature, ou ajoute des amis dont la créature a déjà son marqueur, puis reviens ici.</CardText>
          <Link href="/home" className="mt-3 inline-block text-sm font-semibold text-sage-300 underline">
            Retour à la créature
          </Link>
        </Card>
      )}

      {own ? (
        <Link href="/play" className="flex min-h-14 items-center gap-3 rounded-3xl border border-ink-600/80 bg-ink-800/70 px-4 py-3 text-sm text-cream-100 hover:border-sage-500/50" data-ar-games>
          <Gamepad2 className="h-5 w-5 shrink-0 text-sage-300" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <strong>Envie de jouer sur ce marqueur ?</strong>
            <span className="block text-xs text-cream-500">Défendre, Arène, Défendre ensemble, Ping-pong : tous les jeux sont derrière « Jouer ».</span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-cream-700" aria-hidden="true" />
        </Link>
      ) : null}

      {own ? <MarkerCard name={own.creature.name ?? "ta créature"} markerId={own.markerId} creatureId={own.creatureId} /> : null}

      <Card>
        <CardTitle>Créatures reconnues sur ton écran</CardTitle>
        <CardText className="mt-1">
          Les marqueurs de tes amis marchent aussi sur ton téléphone : posez vos feuilles côte à côte et vos créatures apparaissent ensemble. Chacun imprime le sien depuis son
          application.
        </CardText>
        {targets.length > 0 ? (
          <ul className="mt-3 flex flex-wrap gap-2">
            {own ? (
              <li className="rounded-full border border-sage-500/50 bg-sage-500/15 px-3 py-1 text-xs font-semibold text-sage-200">{own.creature.name} (toi)</li>
            ) : null}
            {others.map((t) => (
              <li key={t.markerId} className="inline-flex items-center gap-2 rounded-full border border-ink-500 bg-ink-700 py-1 pl-3 pr-3 text-xs text-cream-300" data-ar-friend={t.markerId}>
                {t.creature.name}
                {t.ownerName ? <span className="text-cream-700"> · {t.ownerName}</span> : null}
              </li>
            ))}
          </ul>
        ) : null}
        {conflicts.length > 0 ? (
          <p className="mt-3 text-xs text-brass-300">
            {conflicts.join(", ")} {conflicts.length > 1 ? "partagent" : "partage"} un numéro de marqueur avec une autre créature de cette liste et ne
            {conflicts.length > 1 ? " s'afficheront" : " s'affichera"} pas ici.
          </p>
        ) : null}
      </Card>

      <Card>
        <CardTitle>Comment ça marche</CardTitle>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm leading-relaxed text-cream-300">
          <li>Imprime le marqueur et pose-le sur une table éclairée.</li>
          <li>Lance la caméra et cadre le carré.</li>
          <li>Ta créature se tient dessus, avec ses accessoires. Approche-toi, éloigne-toi, déplace la feuille : elle suit. Fais tourner la feuille : tu la vois de profil, puis de dos.</li>
          <li>Ajoute les marqueurs de tes amis pour voir plusieurs créatures à la fois, puis prends une photo.</li>
        </ol>
        <p className="mt-3 text-xs text-cream-700">Les images de la caméra sont analysées sur ton téléphone et n&apos;en sortent jamais.</p>
      </Card>
    </div>
  );
}
