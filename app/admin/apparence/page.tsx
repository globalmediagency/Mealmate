import type { Metadata } from "next";
import { ThemeAdmin } from "@/components/admin/theme-admin";
import { ConfigBanner } from "@/components/system/config-banner";
import { requireAdmin } from "@/lib/admin/auth";
import { isConfigError } from "@/lib/env";
import { THEMES } from "@/lib/themes/catalog";
import { countThemeChoices, getStoredThemeSettings } from "@/lib/themes/service";

export const metadata: Metadata = { title: "Apparence" };
export const dynamic = "force-dynamic";

/** Admin « Apparence »: the designs of the site, which ones players may pick and which one is served by default. */
export default async function AdminThemesPage() {
  await requireAdmin();
  try {
    const [stored, choices] = await Promise.all([getStoredThemeSettings(), countThemeChoices()]);
    return (
      <div className="space-y-6 animate-rise">
        <div>
          <h1 className="font-display text-3xl font-semibold text-cream-50">Apparence</h1>
          <p className="mt-1 text-sm text-cream-500">
            {THEMES.length} designs du site (couleurs, polices, formes). Les joueurs choisissent le leur dans « Plus » ; ceux qui ne choisissent rien
            voient le design par défaut. Un design désactivé disparaît du choix, et ceux qui l&apos;avaient reviennent au défaut (leur choix est gardé au cas
            où tu le réactives). Les changements s&apos;appliquent au plus tard une minute après l&apos;enregistrement.
            {stored.updatedAt ? ` Dernière modification : ${stored.updatedAt.toLocaleString("fr-FR")}${stored.updatedBy ? ` par ${stored.updatedBy}` : ""}.` : ""}
          </p>
        </div>
        <ThemeAdmin themes={THEMES} defaultId={stored.defaultId} disabled={[...stored.disabled]} choices={choices} />
      </div>
    );
  } catch (error) {
    if (isConfigError(error)) return <ConfigBanner error={error} />;
    throw error;
  }
}
