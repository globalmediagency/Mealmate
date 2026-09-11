"use client";

import { Flower2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { HostedDeathView } from "@/lib/boarding/service";

/** Tells the host that a creature entrusted to them died; each notice is dismissed on its own. */
export function HostedDeathNotice({ deaths }: { deaths: HostedDeathView[] }) {
  const router = useRouter();
  const [hidden, setHidden] = useState<string[]>([]);
  const [pending, setPending] = useState<string | null>(null);
  const shown = deaths.filter((d) => !hidden.includes(d.boardingId));
  if (shown.length === 0) return null;

  async function dismiss(boardingId: string) {
    setPending(boardingId);
    try {
      await fetch("/api/boardings/seen", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ boardingId }) });
    } catch {
      // Best effort: the notice simply shows again next time.
    } finally {
      setHidden((h) => [...h, boardingId]);
      setPending(null);
      router.refresh();
    }
  }

  return (
    <div className="space-y-2">
      {shown.map((death) => {
        const name = death.creatureName ?? "La créature";
        const diedOn = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", timeZone: "Europe/Paris" }).format(new Date(death.diedAt));
        return (
          <div key={death.boardingId} role="status" className="rounded-2xl border border-ink-500/80 bg-ink-800/90 px-4 py-3 text-sm text-cream-100 animate-rise">
            <div className="flex items-start gap-3">
              <Flower2 className="mt-0.5 h-5 w-5 shrink-0 text-cream-500" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{name} n&apos;a pas survécu à sa pension chez toi</p>
                <p className="mt-1 text-cream-300">
                  Une longue maladie l&apos;a emporté·e le {diedOn}. {name} est revenu·e auprès de {death.ownerName}, qui choisira son prochain œuf. Ce n&apos;est pas un échec :
                  merci d&apos;avoir pris soin d&apos;elle.
                </p>
              </div>
              <button
                type="button"
                onClick={() => dismiss(death.boardingId)}
                disabled={pending === death.boardingId}
                className="min-h-11 shrink-0 rounded-xl border border-ink-500 px-3 text-xs font-semibold text-cream-300 hover:bg-ink-700"
              >
                J&apos;ai compris
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
