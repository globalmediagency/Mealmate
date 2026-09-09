import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export const metadata: Metadata = { title: "Politique de confidentialité" };

export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-md px-5 pb-12 safe-top safe-bottom">
      <Link
        href="/"
        className="mt-5 inline-flex items-center gap-1.5 text-sm text-cream-500 hover:text-cream-100"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Retour
      </Link>
      <article className="prose-mm mt-6 space-y-5 text-sm leading-relaxed text-cream-300">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-cream-50">
          Politique de confidentialité
        </h1>
        <p>
          MealMate est un prototype. Cette page dit simplement ce que nous conservons et
          pourquoi.
        </p>
        <h2 className="font-display text-xl font-semibold text-cream-50">Ce que nous stockons</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Ton email, ton pseudo et un mot de passe chiffré (ou ton identifiant Google).</li>
          <li>
            Les données de jeu : créatures, pas saisis, parties jouées, accessoires, amis,
            achats.
          </li>
          <li>
            Les photos de tes repas et leur analyse (score, aliments reconnus, commentaire).
          </li>
          <li>Si tu connectes Strava : tes activités des 30 derniers jours (distance, durée).</li>
        </ul>
        <h2 className="font-display text-xl font-semibold text-cream-50">Tes photos de repas</h2>
        <p>
          Elles sont stockées dans un espace privé, ne sont <strong>visibles que par toi</strong>
          , et ne sont jamais montrées à tes amis ni à qui que ce soit d&apos;autre. Elles sont
          envoyées à Google Gemini uniquement pour être analysées.
        </p>
        <h2 className="font-display text-xl font-semibold text-cream-50">Services tiers</h2>
        <p>
          Hébergement Vercel, base de données Neon, stockage Cloudflare R2, analyse Google
          Gemini, paiements Stripe, activités Strava. Chacun ne reçoit que ce qui lui est
          nécessaire.
        </p>
        <h2 className="font-display text-xl font-semibold text-cream-50">Tes droits</h2>
        <p>
          Tu peux supprimer ton compte à tout moment depuis les réglages : toutes tes données,
          photos comprises, sont alors effacées. Pour toute question, écris-nous à l&apos;adresse
          indiquée dans les mentions légales.
        </p>
        <p className="text-xs text-cream-700">Dernière mise à jour : septembre 2026.</p>
      </article>
    </main>
  );
}
