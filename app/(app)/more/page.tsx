import type { Metadata } from "next";
import { Check, ChevronRight, Smartphone, X } from "lucide-react";
import Link from "next/link";
import { LogoutButton } from "@/components/auth/logout-button";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardText, CardTitle } from "@/components/ui/card";
import { CopyButton } from "@/components/ui/copy-button";
import { requireViewer } from "@/lib/auth/session";
import { getConfigStatus } from "@/lib/env";

export const metadata: Metadata = { title: "Plus" };

const SERVICE_LABELS: Array<{ key: keyof ReturnType<typeof getConfigStatus>; label: string }> = [
  { key: "database", label: "Base de données (Neon)" },
  { key: "authSecret", label: "Authentification" },
  { key: "google", label: "Connexion Google" },
  { key: "r2", label: "Stockage photos (R2)" },
  { key: "gemini", label: "Analyse des repas (Gemini)" },
  { key: "stripe", label: "Boutique (Stripe)" },
  { key: "strava", label: "Strava" },
];

export default async function MorePage() {
  const { session, profile } = await requireViewer();
  const status = getConfigStatus();

  return (
    <div className="space-y-5 animate-rise">
      <PageHeader title="Plus" subtitle="Profil, réglages et informations." />

      <Card>
        <CardTitle className="text-lg">Mon profil</CardTitle>
        <dl className="mt-4 space-y-4">
          <div>
            <dt className="text-xs uppercase tracking-wider text-cream-700">Pseudo</dt>
            <dd className="mt-0.5 text-lg font-semibold text-cream-50">{profile.username}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wider text-cream-700">Email</dt>
            <dd className="mt-0.5 break-all text-sm text-cream-300">{session.user.email}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wider text-cream-700">Code ami</dt>
            <dd className="mt-1 flex items-center justify-between gap-3">
              <span className="font-mono text-xl font-semibold tracking-[0.18em] text-brass-300">
                {profile.friendCode}
              </span>
              <CopyButton value={profile.friendCode} label="Copier mon code ami" />
            </dd>
          </div>
        </dl>
        <CardText className="mt-4">
          Partage ton code ami pour que tes proches puissent t&apos;ajouter.
        </CardText>
      </Card>

      <Card className="flex gap-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-sage-800/40 text-sage-300">
          <Smartphone className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <CardTitle className="text-base">Installer sur ton téléphone</CardTitle>
          <CardText className="mt-1">
            iPhone : Partager → « Sur l&apos;écran d&apos;accueil ». Android : menu du navigateur →
            « Installer l&apos;application ».
          </CardText>
        </div>
      </Card>

      <Card>
        <CardTitle className="text-lg">État des services</CardTitle>
        <ul className="mt-3 divide-y divide-ink-600/80">
          {SERVICE_LABELS.map(({ key, label }) => {
            const active = status[key];
            return (
              <li key={key} className="flex items-center justify-between py-2.5 text-sm">
                <span className="text-cream-300">{label}</span>
                <span
                  className={
                    active
                      ? "inline-flex items-center gap-1 text-health"
                      : "inline-flex items-center gap-1 text-cream-700"
                  }
                >
                  {active ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
                  {active ? "Actif" : "Non configuré"}
                </span>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card className="p-2">
        <ul className="divide-y divide-ink-600/80">
          {[
            { href: "/cemetery", label: "Cimetière" },
            { href: "/privacy", label: "Politique de confidentialité" },
            { href: "/legal", label: "Mentions légales" },
          ].map(({ href, label }) => (
            <li key={href}>
              <Link
                href={href}
                className="flex min-h-13 items-center justify-between px-3 text-sm font-medium text-cream-100 hover:text-sage-300"
              >
                {label}
                <ChevronRight className="h-4 w-4 text-cream-700" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      </Card>

      <LogoutButton />
      <p className="pb-2 text-center text-xs text-cream-700">MealMate · prototype web</p>
    </div>
  );
}
