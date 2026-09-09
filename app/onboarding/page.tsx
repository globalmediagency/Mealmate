import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { UsernameForm } from "@/components/auth/username-form";
import { Logo } from "@/components/brand/logo";
import { ConfigMissingScreen } from "@/components/system/config-missing-screen";
import { requireSession, safeGetSession } from "@/lib/auth/session";
import { getProfile } from "@/lib/profile/service";
import { validateUsername } from "@/lib/profile/username";

export const metadata: Metadata = { title: "Choisis ton pseudo" };
export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const { configError } = await safeGetSession();
  if (configError) return <ConfigMissingScreen error={configError} />;

  const session = await requireSession("/onboarding");
  const profile = await getProfile(session.user.id);
  if (profile) redirect("/home");

  const candidate = (session.user.name ?? "").replace(/[^A-Za-z0-9_]/g, "").slice(0, 20);
  const suggestion = validateUsername(candidate).ok ? candidate : "";

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pb-10 safe-top safe-bottom">
      <header className="py-5">
        <Link href="/" aria-label="Accueil" className="inline-flex">
          <Logo withWordmark />
        </Link>
      </header>
      <div className="space-y-6 animate-rise">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-cream-50">
            Une dernière chose
          </h1>
          <p className="mt-1 text-sm text-cream-500">
            Choisis le pseudo que tes amis verront. Tu recevras aussi un code ami unique.
          </p>
        </div>
        <UsernameForm suggestion={suggestion} />
      </div>
    </main>
  );
}
