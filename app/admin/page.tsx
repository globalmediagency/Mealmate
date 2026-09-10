import type { Metadata } from "next";
import { AdminLogoutButton } from "@/components/admin/login-form";
import { RulesForm } from "@/components/admin/rules-form";
import { ConfigBanner } from "@/components/system/config-banner";
import { requireAdmin } from "@/lib/admin/auth";
import { getAdminStats, type AdminStats } from "@/lib/admin/stats";
import { isConfigError } from "@/lib/env";
import { getStoredRules, getGameRules } from "@/lib/game/rules-service";

export const metadata: Metadata = { title: "Règles de jeu" };
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  await requireAdmin();
  try {
    const [rules, stored, stats] = await Promise.all([getGameRules(), getStoredRules(), getAdminStats()]);
    return (
      <div className="space-y-6 animate-rise">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-semibold text-cream-50">Règles de jeu</h1>
            <p className="mt-1 text-sm text-cream-500">
              Niveau d&apos;exigence des créatures par niveau d&apos;œuf. Les changements s&apos;appliquent à toutes les créatures
              vivantes dès la prochaine ouverture (au plus tard une minute après l&apos;enregistrement).
            </p>
          </div>
          <AdminLogoutButton />
        </div>
        <StatsGrid stats={stats} />
        <RulesForm initialRules={rules} storedPatch={stored.patch} updatedAt={stored.updatedAt?.toISOString() ?? null} updatedBy={stored.updatedBy} />
      </div>
    );
  } catch (error) {
    if (isConfigError(error)) {
      return (
        <div className="space-y-4">
          <AdminLogoutButton />
          <ConfigBanner error={error} />
        </div>
      );
    }
    throw error;
  }
}

function StatsGrid({ stats }: { stats: AdminStats }) {
  const items = [
    { label: "Comptes", value: stats.users },
    { label: "Œufs", value: stats.eggs },
    { label: "Créatures vivantes", value: stats.alive },
    { label: "dont malades", value: stats.sick },
    { label: "Au cimetière", value: stats.dead },
    { label: "Repas aujourd'hui", value: stats.mealsToday },
    { label: "Repas au total", value: stats.mealsTotal },
  ];
  return (
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="rounded-2xl border border-ink-600/80 bg-ink-800/80 p-3">
          <dt className="text-[11px] uppercase tracking-wider text-cream-700">{item.label}</dt>
          <dd className="mt-1 font-display text-2xl font-semibold tabular-nums text-cream-50">{item.value.toLocaleString("fr-FR")}</dd>
        </div>
      ))}
    </dl>
  );
}
