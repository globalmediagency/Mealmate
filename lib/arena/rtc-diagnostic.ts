/**
 * Pure helpers for the WebRTC diagnostics (admin "Réseau" tab and the arena
 * HUD): what kind of ICE candidates a browser gathered, and which kind of
 * pair carries a connection.
 */

export type CandidateKind = "host" | "srflx" | "prflx" | "relay";

/** The type of an ICE candidate line (`… typ relay …`), or null when unreadable. */
export function candidateKind(candidate: string): CandidateKind | null {
  const match = /\styp\s+(host|srflx|prflx|relay)\b/.exec(candidate);
  return match ? (match[1] as CandidateKind) : null;
}

export type CandidateSummary = Record<CandidateKind, number>;

export function summarizeCandidates(candidates: string[]): CandidateSummary {
  const summary: CandidateSummary = { host: 0, srflx: 0, prflx: 0, relay: 0 };
  for (const c of candidates) {
    const kind = candidateKind(c);
    if (kind) summary[kind] += 1;
  }
  return summary;
}

/**
 * From a stats report (the values of `RTCPeerConnection.getStats()`): the
 * kind of path of the selected candidate pair. A relay on either side means
 * the TURN server carries the traffic.
 */
export function selectedPairKind(stats: Iterable<Record<string, unknown>>): CandidateKind | null {
  const list = [...stats];
  const byId = new Map<string, Record<string, unknown>>();
  for (const s of list) if (typeof s.id === "string") byId.set(s.id, s);
  let pair: Record<string, unknown> | undefined;
  for (const s of list) {
    if (s.type === "transport" && typeof s.selectedCandidatePairId === "string") {
      pair = byId.get(s.selectedCandidatePairId);
      if (pair) break;
    }
  }
  if (!pair) pair = list.find((s) => s.type === "candidate-pair" && s.state === "succeeded" && (s.nominated === true || s.selected === true));
  if (!pair) return null;
  const local = typeof pair.localCandidateId === "string" ? byId.get(pair.localCandidateId) : undefined;
  const remote = typeof pair.remoteCandidateId === "string" ? byId.get(pair.remoteCandidateId) : undefined;
  const kinds = [local?.candidateType, remote?.candidateType].filter((k): k is CandidateKind => k === "host" || k === "srflx" || k === "prflx" || k === "relay");
  if (kinds.includes("relay")) return "relay";
  if (kinds.includes("srflx") || kinds.includes("prflx")) return "srflx";
  if (kinds.includes("host")) return "host";
  return null;
}

/** One line of the diagnostic report. */
export type DiagnosticStep = {
  id: "credentials" | "gather" | "relay" | "direct" | "rule";
  label: string;
  status: "pending" | "running" | "ok" | "warn" | "fail";
  detail?: string;
  ms?: number;
};

export const DIAGNOSTIC_STEPS: Array<Pick<DiagnosticStep, "id" | "label">> = [
  { id: "credentials", label: "Identifiants TURN obtenus de Cloudflare par le serveur" },
  { id: "gather", label: "Chemins trouvés par ce navigateur (local, STUN, relais)" },
  { id: "relay", label: "Liaison de test en passant uniquement par le relais TURN" },
  { id: "direct", label: "Liaison de test avec tous les chemins (comme deux téléphones proches)" },
  { id: "rule", label: "Case « WebRTC » cochée dans les règles de jeu" },
];
