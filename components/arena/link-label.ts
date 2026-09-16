import type { LinkState } from "./transport";

/** A key that changes when any peer's state or path changes (HUD updates only then). */
export const linkKey = (link: LinkState) => link.peers.map((p) => `${p.userId}:${p.state}:${p.via ?? ""}`).join("|");

/** Short label of the direct link for the HUD pill. */
export function linkLabel(link: LinkState): string {
  const base = `Direct ${link.connected}/${link.total}`;
  if (link.total === 0) return base;
  if (link.connected === link.total) {
    const relay = link.peers.some((p) => p.via === "relay");
    const known = link.peers.some((p) => p.via !== null);
    return `${base} · ${relay ? "relais" : known ? "local" : "ok"}`;
  }
  const failed = link.peers.some((p) => p.state === "failed");
  return `${base} · ${failed ? "sondage" : "connexion…"}`;
}
