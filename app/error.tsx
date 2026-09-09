"use client";

import { useEffect } from "react";
import { Button, LinkButton } from "@/components/ui/button";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-5 px-5 text-center safe-top safe-bottom">
      <h1 className="font-display text-2xl font-semibold text-cream-50">Oups, quelque chose a cassé</h1>
      <p className="max-w-xs text-sm leading-relaxed text-cream-500">
        Ce n&apos;est pas de ta faute. Réessaie dans un instant.
      </p>
      <div className="flex w-full max-w-xs flex-col gap-3">
        <Button onClick={reset}>Réessayer</Button>
        <LinkButton href="/" variant="ghost">
          Retour à l&apos;accueil
        </LinkButton>
      </div>
    </main>
  );
}
