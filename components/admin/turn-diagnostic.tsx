"use client";

import { Activity, CircleAlert, CircleCheck, CircleX, LoaderCircle } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardText, CardTitle } from "@/components/ui/card";
import { DIAGNOSTIC_STEPS, selectedPairKind, summarizeCandidates, type DiagnosticStep } from "@/lib/arena/rtc-diagnostic";
import { cn } from "@/lib/utils/cn";

type TurnAnswer = { configured: boolean; ok: boolean; servers: RTCIceServer[]; fetchMs: number; stun: readonly string[]; webrtc: boolean };

const GATHER_TIMEOUT_MS = 6000;
const CONNECT_TIMEOUT_MS = 12_000;
const PINGS = 5;

function wait<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([promise, new Promise<T>((_, reject) => setTimeout(() => reject(new Error(label)), ms))]);
}

/** Gathers ICE candidates for a throwaway connection and returns their lines with the time of the first relay. */
async function gather(iceServers: RTCIceServer[]): Promise<{ candidates: string[]; firstRelayMs: number | null; ms: number }> {
  const pc = new RTCPeerConnection({ iceServers });
  const candidates: string[] = [];
  const started = performance.now();
  let firstRelayMs: number | null = null;
  const done = new Promise<void>((resolve) => {
    pc.onicecandidate = (event) => {
      if (!event.candidate) {
        resolve();
        return;
      }
      candidates.push(event.candidate.candidate);
      if (firstRelayMs === null && / typ relay /.test(` ${event.candidate.candidate} `)) firstRelayMs = Math.round(performance.now() - started);
    };
    pc.onicegatheringstatechange = () => {
      if (pc.iceGatheringState === "complete") resolve();
    };
  });
  try {
    pc.createDataChannel("probe");
    await pc.setLocalDescription(await pc.createOffer());
    await wait(done, GATHER_TIMEOUT_MS, "gathering timeout").catch(() => undefined);
    return { candidates, firstRelayMs, ms: Math.round(performance.now() - started) };
  } finally {
    pc.close();
  }
}

/** Two connections in this page joined through the given servers and policy: time to open a channel, round trip, and the path used. */
async function loopback(iceServers: RTCIceServer[], policy: RTCIceTransportPolicy): Promise<{ connectMs: number; rttMs: number; via: string | null }> {
  const a = new RTCPeerConnection({ iceServers, iceTransportPolicy: policy });
  const b = new RTCPeerConnection({ iceServers, iceTransportPolicy: policy });
  try {
    a.onicecandidate = (e) => {
      if (e.candidate) void b.addIceCandidate(e.candidate).catch(() => undefined);
    };
    b.onicecandidate = (e) => {
      if (e.candidate) void a.addIceCandidate(e.candidate).catch(() => undefined);
    };
    const channel = a.createDataChannel("probe", { ordered: true });
    const remote = new Promise<RTCDataChannel>((resolve) => {
      b.ondatachannel = (e) => resolve(e.channel);
    });
    const started = performance.now();
    const opened = new Promise<void>((resolve, reject) => {
      channel.onopen = () => resolve();
      channel.onerror = () => reject(new Error("channel error"));
    });
    await a.setLocalDescription(await a.createOffer());
    await b.setRemoteDescription(a.localDescription!);
    await b.setLocalDescription(await b.createAnswer());
    await a.setRemoteDescription(b.localDescription!);
    await wait(opened, CONNECT_TIMEOUT_MS, "connect timeout");
    const connectMs = Math.round(performance.now() - started);
    const echo = await remote;
    echo.onmessage = (e) => echo.send(e.data);
    let total = 0;
    for (let i = 0; i < PINGS; i += 1) {
      const sent = performance.now();
      const reply = new Promise<void>((resolve) => {
        channel.onmessage = () => resolve();
      });
      channel.send(`ping ${i}`);
      await wait(reply, 3000, "ping timeout");
      total += performance.now() - sent;
    }
    const stats = await a.getStats();
    const via = selectedPairKind(stats.values() as Iterable<Record<string, unknown>>);
    return { connectMs, rttMs: Math.round((total / PINGS) * 10) / 10, via };
  } finally {
    a.close();
    b.close();
  }
}

const VIA_LABEL: Record<string, string> = { host: "réseau local", srflx: "STUN (adresse publique)", prflx: "STUN (adresse publique)", relay: "relais TURN" };

export type TurnDiagnosticProps = { configured: boolean; webrtc: boolean };

/**
 * Admin "Réseau" tab: checks, from this very browser, that the Cloudflare
 * TURN relay answers and carries a connection, and that the WebRTC rule is
 * on. Run it from the phone that misbehaves, on its own network.
 */
export function TurnDiagnostic({ configured, webrtc }: TurnDiagnosticProps) {
  const [steps, setSteps] = useState<DiagnosticStep[]>(() => DIAGNOSTIC_STEPS.map((s) => ({ ...s, status: "pending" })));
  const [running, setRunning] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const cancelled = useRef(false);

  function update(id: DiagnosticStep["id"], patch: Partial<DiagnosticStep>) {
    setSteps((list) => list.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  async function run() {
    setRunning(true);
    setSummary(null);
    cancelled.current = false;
    setSteps(DIAGNOSTIC_STEPS.map((s) => ({ ...s, status: "pending" })));
    if (typeof RTCPeerConnection === "undefined") {
      setSummary("Ce navigateur ne sait pas faire de WebRTC : les parties resteront en sondage sur cet appareil.");
      setRunning(false);
      return;
    }
    let answer: TurnAnswer | null = null;
    update("credentials", { status: "running" });
    try {
      const response = await fetch("/api/admin/turn", { cache: "no-store" });
      if (!response.ok) throw new Error(`${response.status}`);
      answer = (await response.json()) as TurnAnswer;
      const turnUrls = answer.servers.flatMap((s) => (Array.isArray(s.urls) ? s.urls : [s.urls])).filter((u) => u.startsWith("turn"));
      if (!answer.configured) update("credentials", { status: "fail", detail: "Variables CLOUDFLARE_TURN_KEY_ID / CLOUDFLARE_TURN_API_TOKEN absentes sur Vercel (ou pas encore redéployées)." });
      else if (!answer.ok) update("credentials", { status: "fail", detail: "Cloudflare n'a pas répondu ou a refusé le jeton : vérifie la clé TURN dans le tableau de bord Cloudflare." });
      else update("credentials", { status: "ok", ms: answer.fetchMs, detail: `${turnUrls.length} adresse${turnUrls.length > 1 ? "s" : ""} de relais : ${turnUrls.join(", ")}` });
    } catch {
      update("credentials", { status: "fail", detail: "Le serveur n'a pas répondu (session admin expirée ?)." });
    }
    const servers: RTCIceServer[] = [...(answer?.stun ?? ["stun:stun.l.google.com:19302"]).map((urls) => ({ urls })), ...(answer?.servers ?? [])];

    update("gather", { status: "running" });
    let relayFound = false;
    try {
      const { candidates, firstRelayMs, ms } = await gather(servers);
      const counts = summarizeCandidates(candidates);
      relayFound = counts.relay > 0;
      const detail = `${counts.host} local · ${counts.srflx} STUN · ${counts.relay} relais${firstRelayMs !== null ? ` (premier relais après ${firstRelayMs} ms)` : ""}`;
      update("gather", { status: relayFound ? "ok" : counts.srflx > 0 ? "warn" : "fail", ms, detail: relayFound ? detail : `${detail}. ${counts.srflx > 0 ? "Sans relais, deux téléphones sur des réseaux différents peuvent ne pas se joindre." : "Ni STUN ni relais : ce réseau bloque sans doute l'UDP ; le relais en TCP (port 443) devrait quand même passer s'il est configuré."}` });
    } catch (error) {
      update("gather", { status: "fail", detail: `Impossible de collecter les chemins : ${error instanceof Error ? error.message : "erreur"}` });
    }

    update("relay", { status: "running" });
    if (!relayFound) update("relay", { status: "fail", detail: "Pas de chemin par le relais : test impossible." });
    else {
      try {
        const { connectMs, rttMs, via } = await loopback(servers, "relay");
        update("relay", { status: "ok", ms: connectMs, detail: `Connecté en ${connectMs} ms, aller-retour ${rttMs} ms${via ? ` via ${VIA_LABEL[via] ?? via}` : ""}.` });
      } catch (error) {
        update("relay", { status: "fail", detail: `La liaison par le relais n'a pas abouti (${error instanceof Error ? error.message : "erreur"}) : identifiants refusés par le relais ou trafic TURN bloqué.` });
      }
    }

    update("direct", { status: "running" });
    try {
      const { connectMs, rttMs, via } = await loopback(servers, "all");
      update("direct", { status: "ok", ms: connectMs, detail: `Connecté en ${connectMs} ms, aller-retour ${rttMs} ms${via ? ` via ${VIA_LABEL[via] ?? via}` : ""}.` });
    } catch (error) {
      update("direct", { status: "fail", detail: `Aucune liaison possible dans ce navigateur (${error instanceof Error ? error.message : "erreur"}).` });
    }

    const rule = answer?.webrtc ?? webrtc;
    update("rule", { status: rule ? "ok" : "warn", detail: rule ? "Les parties ouvrent la liaison directe." : "Décochée : les parties restent en sondage. Coche-la dans Règles de jeu → Arène puis enregistre." });
    const ruleNote = rule ? "" : " Et la case WebRTC est décochée : tant qu'elle l'est, les parties restent en sondage.";
    setSummary(
      !(answer?.configured ?? configured)
        ? `Le relais n'est pas configuré : seuls les téléphones sur le même réseau se relient en direct, les autres restent en sondage.${ruleNote}`
        : !(answer?.ok ?? false)
          ? `Cloudflare n'a pas fourni d'identifiants : vérifie la clé TURN (étape 1).${ruleNote}`
          : !relayFound
            ? `Le relais est configuré mais ce navigateur n'obtient pas de chemin par le relais : réseau de cet appareil très fermé, ou identifiants refusés.${ruleNote}`
            : !rule
              ? "Le relais répond depuis cet appareil, mais la case WebRTC est décochée : coche-la dans Règles de jeu → Arène pour que les parties l'utilisent."
              : "Tout est en place depuis cet appareil. Si une partie affiche quand même « Direct 0/1 », lance ce test depuis l'autre téléphone, sur son propre réseau, et vérifie que les deux joueurs ont bien rejoint la salle.",
    );
    setRunning(false);
  }

  return (
    <Card data-turn-diagnostic>
      <div className="flex items-center gap-2">
        <Activity className="h-5 w-5 text-sage-300" aria-hidden="true" />
        <CardTitle>Test de la liaison directe (WebRTC / relais TURN)</CardTitle>
      </div>
      <CardText className="mt-1">
        Le test se joue dans ce navigateur : lance-le depuis le téléphone qui pose problème, sur son propre réseau (4G/5G ou Wi-Fi). Il demande des identifiants au
        serveur, cherche les chemins disponibles, puis relie deux connexions de test en passant par le relais.
      </CardText>
      <Button onClick={() => void run()} disabled={running} className="mt-3 w-auto px-6" variant="brass">
        {running ? "Test en cours…" : "Lancer le test"}
      </Button>
      <ol className="mt-4 space-y-2" aria-live="polite">
        {steps.map((step) => (
          <li key={step.id} className="flex items-start gap-3 rounded-2xl bg-ink-900/70 p-3 text-sm" data-step={step.id} data-status={step.status}>
            <span className="mt-0.5 shrink-0">
              {step.status === "ok" ? (
                <CircleCheck className="h-5 w-5 text-health" aria-label="Réussi" />
              ) : step.status === "warn" ? (
                <CircleAlert className="h-5 w-5 text-brass-300" aria-label="À vérifier" />
              ) : step.status === "fail" ? (
                <CircleX className="h-5 w-5 text-danger" aria-label="Échec" />
              ) : step.status === "running" ? (
                <LoaderCircle className="h-5 w-5 animate-spin text-cream-300" aria-label="En cours" />
              ) : (
                <span className="block h-5 w-5 rounded-full border border-ink-500" aria-label="En attente" />
              )}
            </span>
            <span className="min-w-0">
              <span className={cn("block font-semibold", step.status === "pending" ? "text-cream-500" : "text-cream-50")}>
                {step.label}
                {step.ms !== undefined ? <span className="ml-2 text-xs font-normal text-cream-500">{step.ms} ms</span> : null}
              </span>
              {step.detail ? <span className="mt-0.5 block break-words text-xs text-cream-400">{step.detail}</span> : null}
            </span>
          </li>
        ))}
      </ol>
      {summary ? (
        <p className="mt-3 rounded-2xl border border-ink-600/80 bg-ink-800/80 p-3 text-sm text-cream-100" data-turn-summary>
          {summary}
        </p>
      ) : null}
    </Card>
  );
}
