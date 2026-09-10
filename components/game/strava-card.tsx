"use client";

import { Activity, Link2Off, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardText, CardTitle } from "@/components/ui/card";
import { STEPS } from "@/lib/game/config";
import type { ImportedActivity, StravaStatus } from "@/lib/strava/service";

type Message = { tone: "success" | "danger" | "info" | "warning"; text: string };

const NOTICES: Record<string, Message> = {
  connected: { tone: "success", text: "Strava est connecté ! Lance une première synchronisation." },
  denied: { tone: "info", text: "Connexion Strava annulée : rien n'a été enregistré." },
  scope: { tone: "warning", text: "Il faut autoriser la lecture des activités pour importer tes sorties. Réessaie en cochant la case." },
  state: { tone: "danger", text: "Le lien de connexion a expiré. Recommence depuis cette page." },
  config: { tone: "warning", text: "Strava n'est pas configuré sur Vercel (STRAVA_CLIENT_ID et STRAVA_CLIENT_SECRET)." },
  error: { tone: "danger", text: "La connexion à Strava a échoué. Réessaie dans un instant." },
};

type SyncResponse = { imported: ImportedActivity[]; skipped: number; gains: { healthGain: number; xpGain: number }; status: StravaStatus };

export type StravaCardProps = { configured: boolean; status: StravaStatus; notice?: string | null };

/** Connect / sync / disconnect Strava from the activity page. */
export function StravaCard({ configured, status, notice = null }: StravaCardProps) {
  const router = useRouter();
  const [message, setMessage] = useState<Message | null>(notice ? (NOTICES[notice] ?? null) : null);
  const [pending, setPending] = useState<"sync" | "disconnect" | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [lastSync, setLastSync] = useState<SyncResponse | null>(null);

  useEffect(() => {
    if (notice) window.history.replaceState(null, "", "/activity");
  }, [notice]);

  async function sync() {
    setPending("sync");
    setMessage(null);
    setLastSync(null);
    try {
      const response = await fetch("/api/strava/sync", { method: "POST" });
      const body = (await response.json().catch(() => null)) as SyncResponse | { error: { message: string } } | null;
      if (!response.ok || !body || "error" in body) {
        setMessage({ tone: "danger", text: body && "error" in body ? body.error.message : "Synchronisation impossible." });
        return;
      }
      setLastSync(body);
      const count = body.imported.length;
      const parts: string[] = [];
      if (body.gains.healthGain > 0) parts.push(`+${body.gains.healthGain} santé`);
      if (body.gains.xpGain > 0) parts.push(`+${body.gains.xpGain} XP`);
      setMessage({
        tone: "success",
        text:
          count === 0
            ? "Rien de nouveau depuis la dernière synchronisation."
            : `${count} activité${count > 1 ? "s" : ""} importée${count > 1 ? "s" : ""}${parts.length ? ` · ${parts.join(" · ")}` : ""}.`,
      });
      router.refresh();
    } catch {
      setMessage({ tone: "danger", text: "Impossible de joindre le serveur." });
    } finally {
      setPending(null);
    }
  }

  async function disconnect() {
    setPending("disconnect");
    setMessage(null);
    try {
      const response = await fetch("/api/strava", { method: "DELETE" });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
        setMessage({ tone: "danger", text: body?.error?.message ?? "Déconnexion impossible." });
        return;
      }
      setConfirmDisconnect(false);
      setMessage({ tone: "info", text: "Strava déconnecté. Les pas déjà importés sont conservés." });
      router.refresh();
    } catch {
      setMessage({ tone: "danger", text: "Impossible de joindre le serveur." });
    } finally {
      setPending(null);
    }
  }

  const rates = `1 km à pied ≈ ${Math.round(STEPS.strava.footPerMetre * 1000).toLocaleString("fr-FR")} pas, 1 km à vélo ≈ ${Math.round(STEPS.strava.bikePerMetre * 1000)} pas, autres sports ${STEPS.strava.otherPerMinute} pas par minute.`;

  return (
    <Card className="space-y-3">
      <div className="flex gap-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#fc4c02]/15 text-[#fc4c02]">
          <Activity className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <CardTitle className="text-base">{status.connected ? `Strava · ${status.athleteName ?? `athlète #${status.athleteId}`}` : "Connecter Strava"}</CardTitle>
          <CardText className="mt-1">
            {status.connected
              ? status.lastSyncAt
                ? `Dernière synchronisation : ${new Date(status.lastSyncAt).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}.`
                : "Jamais synchronisé pour l'instant."
              : `Tes courses, marches, randos et sorties vélo des ${STEPS.strava.syncWindowDays} derniers jours comptent comme des pas.`}
          </CardText>
        </div>
      </div>

      {message ? <Alert tone={message.tone}>{message.text}</Alert> : null}

      {!configured ? (
        <CardText>Strava n&apos;est pas configuré sur ce déploiement (variables Vercel STRAVA_CLIENT_ID et STRAVA_CLIENT_SECRET).</CardText>
      ) : !status.connected ? (
        <>
          {/* Plain anchor: the route answers with a redirect to Strava, which a client-side navigation cannot follow. */}
          <a
            href="/api/strava/connect"
            className="inline-flex min-h-13 w-full items-center justify-center gap-2 rounded-2xl bg-[#fc4c02] px-6 text-base font-semibold text-white transition-colors hover:bg-[#e34402] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass-400/70"
          >
            <Activity className="h-5 w-5" aria-hidden="true" />
            Connecter Strava
          </a>
          <CardText className="text-xs">{rates}</CardText>
        </>
      ) : (
        <>
          <Button variant="brass" onClick={sync} disabled={pending !== null}>
            <RefreshCw className={pending === "sync" ? "h-5 w-5 animate-spin" : "h-5 w-5"} aria-hidden="true" />
            {pending === "sync" ? "Synchronisation…" : "Synchroniser"}
          </Button>
          {lastSync && lastSync.imported.length > 0 ? (
            <ul className="divide-y divide-ink-600/80 text-sm">
              {lastSync.imported.slice(0, 8).map((activity) => (
                <li key={activity.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0 truncate text-cream-100">
                    {activity.sport}
                    <span className="text-cream-700"> · {new Date(`${activity.date}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</span>
                  </span>
                  <span className="shrink-0 tabular-nums text-cream-300">+{activity.steps.toLocaleString("fr-FR")} pas</span>
                </li>
              ))}
              {lastSync.imported.length > 8 ? <li className="py-2 text-xs text-cream-700">… et {lastSync.imported.length - 8} de plus.</li> : null}
            </ul>
          ) : null}
          <CardText className="text-xs">{rates}</CardText>
          {confirmDisconnect ? (
            <div className="flex gap-2">
              <Button variant="danger" size="md" onClick={disconnect} disabled={pending !== null}>
                Confirmer la déconnexion
              </Button>
              <Button variant="ghost" size="md" className="w-auto px-4" onClick={() => setConfirmDisconnect(false)}>
                Non
              </Button>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmDisconnect(true)} className="inline-flex min-h-11 items-center gap-1.5 text-xs text-cream-500 hover:text-cream-300">
              <Link2Off className="h-3.5 w-3.5" aria-hidden="true" />
              Déconnecter Strava
            </button>
          )}
        </>
      )}
    </Card>
  );
}
