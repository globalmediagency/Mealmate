import type { Metadata } from "next";
import Link from "next/link";
import { AdminTabs } from "@/components/admin/admin-tabs";
import { Logo } from "@/components/brand/logo";
import { SchemaOutdatedScreen } from "@/components/system/schema-outdated-screen";
import { checkSchema } from "@/lib/db/schema-check";
import { isConfigError } from "@/lib/env";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: { default: "Administration", template: "%s · Admin MealMate" }, robots: { index: false, follow: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Without a database the pages show their own banner; with one, a missing migration blocks everything.
  const missing = await checkSchema()
    .then((s) => s.missing)
    .catch((error) => {
      if (isConfigError(error)) return [];
      throw error;
    });
  if (missing.length > 0) return <SchemaOutdatedScreen missing={missing} />;
  return (
    <div className="min-h-dvh">
      <header className="border-b border-ink-600/80 bg-ink-900/80 safe-top">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 py-3">
          <Link href="/admin" className="inline-flex items-center gap-2">
            <Logo />
            <span className="font-display text-lg font-semibold text-cream-50">Administration</span>
          </Link>
          <Link href="/" className="text-sm text-cream-500 hover:text-cream-100">
            Retour à l&apos;app
          </Link>
        </div>
        <AdminTabs />
      </header>
      <main className="mx-auto w-full max-w-3xl px-4 pb-16 pt-5 safe-bottom">{children}</main>
    </div>
  );
}
