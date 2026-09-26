import type { Metadata } from "next";
import { Check, ChevronRight, FileText, Flower2, Gamepad2, HeartPulse, Layers, ScanLine, Shield, Shirt, Smartphone, X, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { DangerZone } from "@/components/account/danger-zone";
import { LogoutButton } from "@/components/auth/logout-button";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardText, CardTitle } from "@/components/ui/card";
import { CopyButton } from "@/components/ui/copy-button";
import { hasPasswordAccount } from "@/lib/account/service";
import { requireViewer } from "@/lib/auth/session";
import { ALL_SPECIES } from "@/lib/creatures";
import { discoverableSpecies, getDisabledSpecies } from "@/lib/game/species-service";
import { getObtainedSpeciesIds } from "@/lib/creatures/service";
import { getConfigStatus } from "@/lib/env";
import { getOwnedAccessories } from "@/lib/accessories/service";

export const metadata: Metadata = { title: "Plus" };

const SERVICE_LABELS: Array<{ key: keyof ReturnType<typeof getConfigStatus>; label: string }> = [
  { key: "database", label: "Base de données (Neon)" },
  { key: "authSecret", label: "Authentification" },
  { key: "google", label: "Connexion Google" },
  { key: "r2", label: "Stockage photos (R2)" },
  { key: "gemini", label: "Analyse des repas (Gemini)" },
  { key: "stripe", label: "Boutique (Stripe)" },
  { key: "strava", label: "Strava" },
  { key: "admin", label: "Espace admin (/admin)" },
  { key: "turn", label: "Relais TURN Cloudflare (Arène)" },
];

type Entry = { href: string; label: string; detail?: string; icon: LucideIcon };

function Section({ title, entries }: { title: string; entries: Entry[] }) {
  return (
    <section aria-label={title}>
      <h2 className="mb-1.5 px-1 text-xs font-semibold uppercase tracking-wider text-cream-700">{title}</h2>
      <Card className="p-2">
        <ul className="divide-y divide-ink-600/80">
          {entries.map(({ href, label, detail, icon: Icon }) => (
            <li key={href}>
              <Link href={href} className="flex min-h-13 items-center gap-3 px-2 py-1.5 text-sm font-medium text-cream-100 hover:text-sage-300">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-ink-700 text-sage-300">
                  <Icon className="h-4.5 w-4.5" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  {label}
                  {detail ? <span className="block truncate text-xs font-normal text-cream-500">{detail}</span> : null}
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-cream-700" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </section>
  );
}

/** "Plus": a short directory (creature, games, care, account), then the account itself. */
export default async function MorePage() {
  const { session, profile } = await requireViewer();
  const status = getConfigStatus();
  const [hasPassword, owned, obtained, disabledSpecies] = await Promise.all([
    hasPasswordAccount(session.user.id),
    getOwnedAccessories(session.user.id).catch(() => []),
    getObtainedSpeciesIds(session.user.id).catch(() => []),
    getDisabledSpecies(),
  ]);
  const discoverable = discoverableSpecies(ALL_SPECIES, disabledSpecies, new Set(obtained)).length;
  const unavailable: string[] = [];
  if (!status.gemini || !status.r2) unavailable.push("L'analyse des repas est indisponible pour le moment.");
  if (!status.stripe) unavailable.push("La boutique est fermée pour l'instant : les soins reçus en cadeau restent utilisables.");

  return (
    <div className="space-y-5 animate-rise">
      <PageHeader title="Plus" subtitle="Collection, soins, compte." />

      {unavailable.length > 0 ? (
        <p className="rounded-2xl border border-brass-500/40 bg-brass-500/10 px-4 py-3 text-sm text-cream-100" role="status">
          {unavailable.join(" ")}
        </p>
      ) : null}

      <Section
        title="Ma créature"
        entries={[
          { href: "/wardrobe", label: "Garde-robe", detail: `${owned.length} accessoire${owned.length > 1 ? "s" : ""}`, icon: Shirt },
          { href: "/collection", label: "Collection", detail: `${obtained.length} / ${discoverable} créatures découvertes`, icon: Layers },
          { href: "/cemetery", label: "Cimetière", icon: Flower2 },
          { href: "/ar", label: "Voir en vrai", detail: "Ta créature sur sa feuille, dans ta caméra", icon: ScanLine },
        ]}
      />
      <Section title="Jouer" entries={[{ href: "/play", label: "Tous les jeux", detail: "Attrape-repas, Défendre, Arène, Défendre ensemble, Ping-pong", icon: Gamepad2 }]} />
      <Section title="Soins" entries={[{ href: "/shop", label: "Soins et boutique", detail: "Ton armoire à pharmacie, puis les soins à acheter", icon: HeartPulse }]} />

      <section aria-label="Mon compte" className="space-y-3">
        <h2 className="px-1 text-xs font-semibold uppercase tracking-wider text-cream-700">Mon compte</h2>
        <Card>
          <dl className="space-y-3">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-xs uppercase tracking-wider text-cream-700">Pseudo</dt>
              <dd className="truncate text-base font-semibold text-cream-50">{profile.username}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-xs uppercase tracking-wider text-cream-700">Email</dt>
              <dd className="min-w-0 truncate text-sm text-cream-300">{session.user.email}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wider text-cream-700">Code ami</dt>
              <dd className="mt-1 flex items-center justify-between gap-3">
                <span className="font-mono text-xl font-semibold tracking-[0.18em] text-brass-300">{profile.friendCode}</span>
                <CopyButton value={profile.friendCode} label="Copier mon code ami" />
              </dd>
            </div>
          </dl>
          <CardText className="mt-3">Partage ton code ami pour que tes proches puissent t&apos;ajouter.</CardText>
        </Card>

        <Card className="flex gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-sage-800/40 text-sage-300">
            <Smartphone className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <CardTitle className="text-base">Installer sur ton téléphone</CardTitle>
            <CardText className="mt-1">
              iPhone : Partager → « Sur l&apos;écran d&apos;accueil ». Android : menu du navigateur → « Installer l&apos;application ».
            </CardText>
          </div>
        </Card>

        <LogoutButton />
        <DangerZone hasPassword={hasPassword} />
      </section>

      <Section
        title="À propos"
        entries={[
          { href: "/privacy", label: "Politique de confidentialité", icon: Shield },
          { href: "/legal", label: "Mentions légales", icon: FileText },
        ]}
      />

      <details className="rounded-3xl border border-ink-600/80 bg-ink-800/70 px-4 py-2">
        <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-cream-300">État des services</summary>
        <ul className="divide-y divide-ink-600/80 pb-1">
          {SERVICE_LABELS.map(({ key, label }) => {
            const active = status[key];
            return (
              <li key={key} className="flex items-center justify-between py-2.5 text-sm">
                <span className="text-cream-300">{label}</span>
                <span className={active ? "inline-flex items-center gap-1 text-health" : "inline-flex items-center gap-1 text-cream-500"}>
                  {active ? <Check className="h-4 w-4" aria-hidden="true" /> : <X className="h-4 w-4" aria-hidden="true" />}
                  {active ? "Actif" : "Non configuré"}
                </span>
              </li>
            );
          })}
        </ul>
      </details>
      <p className="pb-2 text-center text-xs text-cream-700">MealMate · prototype web</p>
    </div>
  );
}
