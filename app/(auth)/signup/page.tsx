import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SignupForm } from "@/components/auth/signup-form";
import { ConfigBanner } from "@/components/system/config-banner";
import { isGoogleEnabled } from "@/lib/auth";
import { safeGetSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Créer un compte" };
export const dynamic = "force-dynamic";

export default async function SignupPage() {
  const { session, configError } = await safeGetSession();
  if (session) redirect("/home");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-cream-50">
          Créer ton compte
        </h1>
        <p className="mt-1 text-sm text-cream-500">
          Choisis un pseudo : c&apos;est lui que tes amis verront.
        </p>
      </div>
      {configError ? <ConfigBanner error={configError} /> : null}
      <SignupForm googleEnabled={isGoogleEnabled()} />
    </div>
  );
}
