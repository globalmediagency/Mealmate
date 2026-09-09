import { LinkButton } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-5 px-5 text-center safe-top safe-bottom">
      <p className="font-display text-6xl font-semibold text-sage-500">404</p>
      <h1 className="font-display text-2xl font-semibold text-cream-50">Cette page n&apos;existe pas</h1>
      <p className="text-sm text-cream-500">Ta créature n&apos;est pas passée par là.</p>
      <LinkButton href="/" variant="secondary" className="w-auto">
        Retour à l&apos;accueil
      </LinkButton>
    </main>
  );
}
