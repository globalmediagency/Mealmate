import { Camera, Footprints, HeartPulse, Users } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { EggTeaser } from "@/components/brand/egg-teaser";
import { Logo } from "@/components/brand/logo";
import { ConfigBanner } from "@/components/system/config-banner";
import { LinkButton } from "@/components/ui/button";
import { safeGetSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

const FEATURES = [
  {
    icon: Camera,
    title: "Nourris-le en photo",
    text: "Prends ton assiette en photo : l'IA note l'équilibre du repas, sans jugement.",
  },
  {
    icon: Footprints,
    title: "Fais-le marcher",
    text: "Tes pas font éclore l'œuf, renforcent ta créature et débloquent des accessoires.",
  },
  {
    icon: HeartPulse,
    title: "Vois-le changer",
    text: "En forme, fatigué ou malade : son état reflète tes habitudes, jour après jour.",
  },
  {
    icon: Users,
    title: "Partage avec tes amis",
    text: "Ajoute des amis par code et découvre leurs créatures.",
  },
] as const;

export default async function LandingPage() {
  const { session, configError } = await safeGetSession();
  if (session) redirect("/home");

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pb-10 safe-top safe-bottom">
      <header className="flex items-center justify-between py-5">
        <Logo withWordmark />
        <Link
          href="/login"
          className="rounded-xl px-3 py-2 text-sm font-semibold text-cream-300 hover:text-cream-50"
        >
          Se connecter
        </Link>
      </header>

      {configError ? (
        <div className="mb-6">
          <ConfigBanner error={configError} />
        </div>
      ) : null}

      <section className="flex flex-col items-center text-center animate-rise">
        <EggTeaser size={190} className="my-2" />
        <h1 className="mt-4 font-display text-4xl font-semibold leading-tight tracking-tight text-cream-50 text-balance">
          Un compagnon qui grandit avec tes vrais repas.
        </h1>
        <p className="mt-4 max-w-sm text-base leading-relaxed text-cream-500 text-pretty">
          Choisis un œuf, fais-le éclore en marchant, puis nourris ta créature en
          photographiant ce que tu manges. Bienveillant, motivant, un peu magique.
        </p>
        <div className="mt-8 flex w-full flex-col gap-3">
          <LinkButton href="/signup">Créer mon compte</LinkButton>
          <LinkButton href="/login" variant="secondary">
            J&apos;ai déjà un compte
          </LinkButton>
        </div>
      </section>

      <section className="mt-12 grid gap-3" aria-label="Comment ça marche">
        {FEATURES.map(({ icon: Icon, title, text }) => (
          <article
            key={title}
            className="flex gap-4 rounded-3xl border border-ink-600/80 bg-ink-800/70 p-4"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-sage-800/40 text-sage-300">
              <Icon className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <h2 className="font-semibold text-cream-50">{title}</h2>
              <p className="mt-0.5 text-sm leading-relaxed text-cream-500">{text}</p>
            </div>
          </article>
        ))}
      </section>

      <footer className="mt-12 flex flex-wrap justify-center gap-x-5 gap-y-2 text-xs text-cream-700">
        <Link href="/privacy" className="hover:text-cream-300">
          Confidentialité
        </Link>
        <Link href="/legal" className="hover:text-cream-300">
          Mentions légales
        </Link>
        <span>MealMate · prototype</span>
      </footer>
    </main>
  );
}
