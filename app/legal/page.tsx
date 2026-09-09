import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export const metadata: Metadata = { title: "Mentions légales" };

export default function LegalPage() {
  const contact = process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? "à compléter";
  return (
    <main className="mx-auto w-full max-w-md px-5 pb-12 safe-top safe-bottom">
      <Link
        href="/"
        className="mt-5 inline-flex items-center gap-1.5 text-sm text-cream-500 hover:text-cream-100"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Retour
      </Link>
      <article className="mt-6 space-y-5 text-sm leading-relaxed text-cream-300">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-cream-50">
          Mentions légales
        </h1>
        <dl className="space-y-3">
          <div>
            <dt className="font-semibold text-cream-50">Éditeur</dt>
            <dd>MealMate, prototype d&apos;application web (usage non commercial à ce stade).</dd>
          </div>
          <div>
            <dt className="font-semibold text-cream-50">Contact</dt>
            <dd>{contact}</dd>
          </div>
          <div>
            <dt className="font-semibold text-cream-50">Hébergement</dt>
            <dd>Vercel Inc., 440 N Barranca Ave #4133, Covina, CA 91723, États-Unis.</dd>
          </div>
          <div>
            <dt className="font-semibold text-cream-50">Données personnelles</dt>
            <dd>
              Voir la{" "}
              <Link href="/privacy" className="underline underline-offset-4">
                politique de confidentialité
              </Link>
              .
            </dd>
          </div>
        </dl>
      </article>
    </main>
  );
}
