import type { Metadata } from "next";
import Link from "next/link";
import { TurnDiagnostic } from "@/components/admin/turn-diagnostic";
import { ConfigBanner } from "@/components/system/config-banner";
import { Card, CardText, CardTitle } from "@/components/ui/card";
import { requireAdmin } from "@/lib/admin/auth";
import { getConfigStatus, isConfigError, type ConfigError } from "@/lib/env";
import { ARENA } from "@/lib/game/config";
import { DEFAULT_RULES } from "@/lib/game/rules";
import { getGameRules } from "@/lib/game/rules-service";

export const metadata: Metadata = { title: "Réseau" };
export const dynamic = "force-dynamic";

/** Admin "Réseau" tab: the state of the arena's direct link (WebRTC rule, TURN relay) and a live test from this browser. */
export default async function AdminNetworkPage() {
  await requireAdmin();
  const status = getConfigStatus();
  let webrtc = DEFAULT_RULES.arena.webrtc;
  let configError: ConfigError | null = null;
  try {
    webrtc = (await getGameRules()).arena.webrtc;
  } catch (error) {
    if (!isConfigError(error)) throw error;
    configError = error;
  }
  return (
    <div className="space-y-6 animate-rise">
      <div>
        <h1 className="font-display text-3xl font-semibold text-cream-50">Réseau</h1>
        <p className="mt-1 text-sm text-cream-500">La liaison directe de l&apos;Arène entre les téléphones : réglage, relais Cloudflare TURN et test en direct.</p>
      </div>
      {configError ? <ConfigBanner error={configError} /> : null}

      <Card>
        <CardTitle>Côté serveur</CardTitle>
        <dl className="mt-2 space-y-2 text-sm">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-cream-300">Case « WebRTC » (Règles de jeu → Arène)</dt>
            <dd className={webrtc ? "font-semibold text-health" : "font-semibold text-brass-300"} data-webrtc-rule={webrtc ? "on" : "off"}>
              {webrtc ? "cochée" : "décochée"}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-cream-300">Relais Cloudflare TURN (variables Vercel)</dt>
            <dd className={status.turn ? "font-semibold text-health" : "font-semibold text-brass-300"} data-turn-configured={status.turn ? "yes" : "no"}>
              {status.turn ? "configuré" : "absent"}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-cream-300">Serveurs STUN publics</dt>
            <dd className="text-right text-xs text-cream-500">{ARENA.rtc.iceServers.join(", ")}</dd>
          </div>
        </dl>
        <CardText className="mt-3 text-xs">
          Sans la case, les parties restent en sondage (le serveur relaie tout, œufs adverses avec jusqu&apos;à une demi-seconde de retard). Sans relais, seuls les téléphones sur
          le même réseau se relient en direct.{" "}
          <Link href="/admin" className="font-semibold text-sage-300 underline">
            Règles de jeu
          </Link>
        </CardText>
      </Card>

      <TurnDiagnostic configured={status.turn} webrtc={webrtc} />

      <Card>
        <CardTitle>Lire une partie</CardTitle>
        <CardText className="mt-1 text-sm">
          Pendant une bataille avec la case cochée, une pastille « Direct n/m » s&apos;affiche en haut de l&apos;écran de jeu : « Direct 1/1 · relais » = liaison ouverte par le
          relais, « · local » = même réseau, « · connexion… » = en cours, « · sondage » = échec, le serveur relaie tout. La liaison ne s&apos;ouvre qu&apos;entre joueurs prêts
          (après « Rejoindre »), et demande quelques secondes.
        </CardText>
      </Card>
    </div>
  );
}
