"use client";

import { RotateCcw, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { RarityBadge } from "@/components/creatures/rarity-badge";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { Rarity } from "@/lib/game/config";
import { formatPercent, PERCENT, quantizeWeight, WEIGHT_DECIMALS } from "@/lib/game/drops";

export type DropRateRow = { id: string; name: string; rarity: Rarity; defaultWeight: number; weight: number; overridden: boolean };

type Props = {
  kind: "species" | "accessories";
  title: string;
  rows: DropRateRow[];
  /** Weights of items in the same pool that are NOT shown here (other slots): keep the totals honest. */
  hiddenPoolWeight?: number;
};

/** Text shown in a weight field (French decimal comma); dot or comma are both accepted on input. */
const toText = (n: number) => String(quantizeWeight(n)).replace(".", ",");

type Parsed = { value: number | null; reason: "empty" | "nan" | "range" | "decimals" | null };

const PLAIN_DECIMAL = /^(?:\d+(?:\.\d*)?|\.\d+)$/;

/** Parses a typed weight: a plain decimal (no exponent or hex), 0..100 %, at most three significant decimals (the stored precision). */
function parseWeight(raw: string): Parsed {
  const text = raw.trim().replace(",", ".");
  if (text === "") return { value: null, reason: "empty" };
  if (!PLAIN_DECIMAL.test(text)) return { value: null, reason: "nan" };
  const n = Number(text);
  if (Number.isNaN(n)) return { value: null, reason: "nan" };
  if (n < 0 || n > PERCENT) return { value: null, reason: "range" };
  if (quantizeWeight(n) !== n) return { value: null, reason: "decimals" };
  return { value: n, reason: null };
}

/** Per-item drop weights in %, with the effective chance computed live. */
export function DropRateEditor({ kind, title, rows, hiddenPoolWeight = 0 }: Props) {
  const router = useRouter();
  const [draft, setDraft] = useState<Record<string, string>>(() => Object.fromEntries(rows.map((r) => [r.id, toText(r.weight)])));
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);

  // A row without a draft entry (rows changed under a kept component state) shows its current weight.
  const text = (row: DropRateRow) => draft[row.id] ?? toText(row.weight);
  const parsed: Record<string, Parsed> = {};
  for (const row of rows) parsed[row.id] = parseWeight(text(row));
  const valueOf = (row: DropRateRow) => parsed[row.id].value;
  const invalid = rows.filter((r) => parsed[r.id].reason !== null && parsed[r.id].reason !== "decimals").map((r) => r.name);
  const tooPrecise = rows.filter((r) => parsed[r.id].reason === "decimals").map((r) => r.name);
  // Untouched fields count with their exact weight (defaults like 60/9 are not representable in 3 decimals), so a default pool totals 100 %.
  const effective = (row: DropRateRow) => (valueOf(row) === quantizeWeight(row.weight) ? row.weight : (valueOf(row) ?? 0));
  const total = rows.reduce((sum, r) => sum + effective(r), 0) + hiddenPoolWeight;
  const dirty = rows.some((r) => valueOf(r) !== quantizeWeight(r.weight));
  const allZero = invalid.length === 0 && tooPrecise.length === 0 && total <= 0;
  const blocked = pending || invalid.length > 0 || tooPrecise.length > 0 || allZero || !dirty;

  async function save(reset = false) {
    setPending(true);
    setMessage(null);
    try {
      const weights: Record<string, number | null> = {};
      for (const row of rows) {
        const value = valueOf(row);
        if (reset || value === null || value === quantizeWeight(row.defaultWeight)) weights[row.id] = null;
        else weights[row.id] = value;
      }
      const response = await fetch("/api/admin/drops", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, weights }) });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
        setMessage({ tone: "danger", text: body?.error?.message ?? "Enregistrement impossible." });
        return;
      }
      if (reset) setDraft(Object.fromEntries(rows.map((r) => [r.id, toText(r.defaultWeight)])));
      setMessage({ tone: "success", text: reset ? "Probabilités remises aux valeurs par défaut." : "Probabilités enregistrées : elles s'appliquent aux prochains tirages (au plus tard dans une minute)." });
      router.refresh();
    } catch {
      setMessage({ tone: "danger", text: "Impossible de joindre le serveur." });
    } finally {
      setPending(false);
    }
  }

  const overriddenCount = rows.filter((r) => r.overridden).length;

  return (
    <details className="group rounded-3xl border border-ink-600/80 bg-ink-800/80">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-2 text-sm font-semibold text-cream-100 [&::-webkit-details-marker]:hidden">
        <span>{title}</span>
        <span className="text-xs font-normal text-cream-500">
          {overriddenCount} modifiée{overriddenCount > 1 ? "s" : ""} · <span className="group-open:hidden">déplier</span>
          <span className="hidden group-open:inline">replier</span>
        </span>
      </summary>
      <div className="space-y-3 border-t border-ink-600/80 p-4">
        <p className="text-xs leading-relaxed text-cream-500">
          Poids en pourcentage (%), jusqu&apos;à {WEIGHT_DECIMALS} chiffres après la virgule. La chance réelle est le poids divisé par le total du groupe :
          avec un total de {formatPercent(total)}, un objet à 10 % sort une fois sur {total > 0 ? (total / 10).toLocaleString("fr-FR", { maximumFractionDigits: 2 }) : "—"}. Un poids
          de 0 retire l&apos;objet des tirages. Laisse la valeur par défaut pour garder la répartition par rareté.
        </p>
        {message ? <Alert tone={message.tone}>{message.text}</Alert> : null}
        {invalid.length > 0 ? <Alert tone="warning">Valeur invalide (0 à 100) pour : {invalid.join(", ")}.</Alert> : null}
        {tooPrecise.length > 0 ? (
          <Alert tone="warning">
            {WEIGHT_DECIMALS} chiffres après la virgule maximum pour : {tooPrecise.join(", ")}.
          </Alert>
        ) : null}
        {allZero ? <Alert tone="warning">Tout est à 0 : au moins un objet du groupe doit pouvoir sortir. Ce réglage ne peut pas être enregistré.</Alert> : null}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-cream-700">
                <th className="py-1 pr-2">Objet</th>
                <th className="py-1 pr-2">Rareté</th>
                <th className="py-1 pr-2">Poids %</th>
                <th className="py-1 pr-2">Chance réelle</th>
                <th className="py-1">Défaut</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const value = valueOf(row);
                const used = effective(row);
                const percent = value !== null && total > 0 ? (used / total) * PERCENT : 0;
                const oneIn = value && value > 0 ? Math.max(1, Math.round(total / used)) : null;
                const changed = value !== quantizeWeight(row.defaultWeight);
                return (
                  <tr key={row.id} className="border-t border-ink-600/60">
                    <td className="py-1.5 pr-2 font-semibold text-cream-50">{row.name}</td>
                    <td className="py-1.5 pr-2">
                      <RarityBadge rarity={row.rarity} className="text-[10px]" />
                    </td>
                    <td className="py-1.5 pr-2">
                      <input
                        type="text"
                        inputMode="decimal"
                        aria-label={`Poids de ${row.name} en pourcentage`}
                        value={text(row)}
                        onChange={(e) => setDraft((d) => ({ ...d, [row.id]: e.target.value }))}
                        className={`min-h-10 w-24 rounded-xl border bg-ink-900/80 px-2 text-base tabular-nums text-cream-50 focus:outline-none focus:ring-2 focus:ring-sage-500/40 ${changed ? "border-brass-400/70" : "border-ink-500"}`}
                      />
                    </td>
                    <td className="py-1.5 pr-2 tabular-nums text-cream-300">
                      {oneIn ? `${formatPercent(percent)} · 1 sur ${oneIn.toLocaleString("fr-FR")}` : value === 0 ? "jamais" : "—"}
                    </td>
                    <td className="py-1.5 text-xs text-cream-700">
                      {formatPercent(row.defaultWeight)}
                      {changed ? (
                        <button type="button" onClick={() => setDraft((d) => ({ ...d, [row.id]: toText(row.defaultWeight) }))} className="ml-2 min-h-8 underline underline-offset-2 hover:text-cream-300">
                          remettre
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="md" className="w-auto px-4" onClick={() => save(false)} disabled={blocked}>
            <Save className="h-4 w-4" aria-hidden="true" />
            Enregistrer
          </Button>
          <Button size="md" variant="ghost" className="w-auto px-4" onClick={() => save(true)} disabled={pending || overriddenCount === 0}>
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            Valeurs par défaut
          </Button>
        </div>
      </div>
    </details>
  );
}
