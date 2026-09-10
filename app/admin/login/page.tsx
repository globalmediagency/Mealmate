import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminLoginForm } from "@/components/admin/login-form";
import { ConfigBanner } from "@/components/system/config-banner";
import { isAdminConfigured, isAdminSession } from "@/lib/admin/auth";
import { ConfigError } from "@/lib/env";

export const metadata: Metadata = { title: "Connexion" };
export const dynamic = "force-dynamic";

export default async function AdminLoginPage() {
  if (await isAdminSession()) redirect("/admin");
  return (
    <div className="mx-auto max-w-sm space-y-6 animate-rise">
      <div>
        <h1 className="font-display text-3xl font-semibold text-cream-50">Espace admin</h1>
        <p className="mt-1 text-sm text-cream-500">Identifiants définis dans les variables d&apos;environnement Vercel.</p>
      </div>
      {isAdminConfigured() ? <AdminLoginForm /> : <ConfigBanner error={new ConfigError(["ADMIN_USERNAME", "ADMIN_PASSWORD"])} />}
    </div>
  );
}
