import type { Metadata } from "next";
import { WifiOff } from "lucide-react";
import { LinkButton } from "@/components/ui/button";

export const metadata: Metadata = { title: "Hors ligne" };

export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-5 px-5 text-center safe-top safe-bottom">
      <span className="flex h-16 w-16 items-center justify-center rounded-full border border-ink-500 bg-ink-700 text-cream-500">
        <WifiOff className="h-7 w-7" aria-hidden="true" />
      </span>
      <h1 className="font-display text-3xl font-semibold text-cream-50">Tu es hors ligne</h1>
      <p className="max-w-xs text-sm leading-relaxed text-cream-500">
        MealMate a besoin d&apos;une connexion pour analyser tes repas et retrouver ta créature.
      </p>
      <LinkButton href="/home" variant="secondary" className="w-auto">
        Réessayer
      </LinkButton>
    </main>
  );
}
