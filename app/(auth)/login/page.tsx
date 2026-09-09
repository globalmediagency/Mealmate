import type { Metadata } from "next";
import { LoginForm } from "@/components/auth/login-form";
import { ConfigBanner } from "@/components/system/config-banner";
import { isGoogleEnabled } from "@/lib/auth";
import { safeGetSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Connexion" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<{ next?: string; error?: string }>;

function safeNext(next: string | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/home";
  return next;
}

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const { session, configError } = await safeGetSession();
  if (session) redirect(safeNext(params.next));

  const initialError =
    params.error === "google" ? "La connexion avec Google n'a pas abouti. Réessaie." : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-cream-50">
          Content de te revoir
        </h1>
        <p className="mt-1 text-sm text-cream-500">Ta créature t&apos;attend.</p>
      </div>
      {configError ? <ConfigBanner error={configError} /> : null}
      <LoginForm
        googleEnabled={isGoogleEnabled()}
        next={safeNext(params.next)}
        initialError={initialError}
      />
    </div>
  );
}
