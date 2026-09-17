import type { Metadata } from "next";
import Link from "next/link";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { Alert } from "@/components/ui/alert";

export const metadata: Metadata = { title: "Nouveau mot de passe" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<{ token?: string }>;

/** Where the one-time link made by the admin lands: the player picks a new password. */
export default async function ResetPasswordPage({ searchParams }: { searchParams: SearchParams }) {
  const { token } = await searchParams;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-cream-50">Nouveau mot de passe</h1>
        <p className="mt-1 text-sm text-cream-500">Choisis-en un que tu n&apos;utilises nulle part ailleurs.</p>
      </div>
      {token ? (
        <ResetPasswordForm token={token} />
      ) : (
        <div className="space-y-4">
          <Alert tone="warning">Ce lien est incomplet. Ouvre exactement celui que tu as reçu, ou demande-en un nouveau.</Alert>
          <Link href="/login" className="text-sm font-semibold text-sage-400 underline-offset-4 hover:underline">
            Retour à la connexion
          </Link>
        </div>
      )}
    </div>
  );
}
