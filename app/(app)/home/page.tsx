import type { Metadata } from "next";
import { Camera, Footprints, Sparkles } from "lucide-react";
import { EggTeaser } from "@/components/brand/egg-teaser";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardText, CardTitle } from "@/components/ui/card";
import { requireViewer } from "@/lib/auth/session";
import { TIER_CONFIG, TIERS } from "@/lib/game/config";

export const metadata: Metadata = { title: "Ma créature" };

const STEPS = [
  { icon: Sparkles, text: "Choisis un œuf : facile, moyen ou difficile." },
  { icon: Footprints, text: "Marche pour le faire éclore et découvrir ta créature." },
  { icon: Camera, text: "Nourris-la en photographiant tes vrais repas." },
] as const;

export default async function HomePage() {
  const { profile } = await requireViewer();

  return (
    <div className="space-y-5 animate-rise">
      <PageHeader title={`Salut, ${profile.username}`} subtitle="Ton compagnon arrive bientôt." />

      <Card className="flex flex-col items-center text-center">
        <EggTeaser size={170} />
        <CardTitle className="mt-2">Ton œuf se prépare</CardTitle>
        <CardText className="mt-2 max-w-xs">
          Le choix de l&apos;œuf, l&apos;incubation et l&apos;éclosion arrivent dans la prochaine
          version. En attendant, voici comment ça va se passer.
        </CardText>
      </Card>

      <Card>
        <CardTitle className="text-lg">Comment ça marche</CardTitle>
        <ol className="mt-4 space-y-3">
          {STEPS.map(({ icon: Icon, text }, index) => (
            <li key={text} className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-sage-800/40 text-sage-300">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="text-sm leading-relaxed text-cream-300">
                <span className="mr-1.5 font-semibold text-brass-300">{index + 1}.</span>
                {text}
              </span>
            </li>
          ))}
        </ol>
      </Card>

      <Card>
        <CardTitle className="text-lg">Trois niveaux d&apos;œuf</CardTitle>
        <CardText className="mt-1">
          Plus la créature est exigeante, plus elle attend une alimentation de qualité, et plus
          vite elle tombe malade si on la néglige. Les créatures faciles sont indulgentes.
        </CardText>
        <ul className="mt-4 divide-y divide-ink-600/80">
          {TIERS.map((tier) => {
            const config = TIER_CONFIG[tier];
            return (
              <li key={tier} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-semibold text-cream-50">{config.label}</p>
                  <p className="text-xs text-cream-500">{config.universe}</p>
                </div>
                <p className="shrink-0 text-right text-xs text-cream-500">
                  <span className="block font-semibold text-cream-300">
                    {config.hatchSteps.toLocaleString("fr-FR")} pas
                  </span>
                  pour éclore
                </p>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
