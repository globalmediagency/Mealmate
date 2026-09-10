import { ArrowDown, ArrowUp, Heart } from "lucide-react";
import { MACRO_LABELS, NEGATIVE_MACROS, PORTION_LABELS, VERDICT_LABELS, type MealAnalysis, type Portion, type Verdict } from "@/lib/ai/meal-schema";
import { cn } from "@/lib/utils/cn";

export type MealResultData = {
  score: number;
  verdict: Verdict;
  foods: string[];
  macros: MealAnalysis["macros"] | Record<string, number>;
  portion: Portion | string | null;
  comment: string | null;
  creatureLine: string | null;
  healthDelta: number;
  imageUrl?: string;
  createdAt?: string;
};

const VERDICT_STYLE: Record<Verdict, string> = {
  sain: "border-health/50 bg-health/15 text-health",
  correct: "border-brass-400/50 bg-brass-500/15 text-brass-300",
  peu_sain: "border-hunger/50 bg-hunger/15 text-hunger",
};

export function scoreColor(score: number): string {
  if (score >= 65) return "#7FB77E";
  if (score >= 40) return "#E8C36A";
  return "#E39B4A";
}

export function ScoreRing({ score, size = 132 }: { score: number; size?: number }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  const dash = (Math.max(0, Math.min(100, score)) / 100) * c;
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} role="img" aria-label={`Score ${score} sur 100`}>
      <circle cx="50" cy="50" r={r} stroke="#242b24" strokeWidth="9" fill="none" />
      <circle
        cx="50"
        cy="50"
        r={r}
        stroke={scoreColor(score)}
        strokeWidth="9"
        strokeLinecap="round"
        fill="none"
        strokeDasharray={`${dash} ${c}`}
        transform="rotate(-90 50 50)"
        style={{ transition: "stroke-dasharray 0.8s ease-out" }}
      />
      <text x="50" y="47" textAnchor="middle" fill="#f7f4ec" fontSize="26" fontWeight="700" fontFamily="var(--font-display)">
        {score}
      </text>
      <text x="50" y="63" textAnchor="middle" fill="#9aa396" fontSize="9">
        / 100
      </text>
    </svg>
  );
}

export function MacroBars({ macros }: { macros: MealResultData["macros"] }) {
  return (
    <ul className="grid grid-cols-2 gap-x-4 gap-y-2.5">
      {(Object.keys(MACRO_LABELS) as (keyof typeof MACRO_LABELS)[]).map((key) => {
        const value = Math.max(0, Math.min(5, Math.round(Number(macros[key] ?? 0))));
        const negative = NEGATIVE_MACROS.has(key);
        return (
          <li key={key}>
            <div className="mb-1 flex justify-between text-[11px]">
              <span className="text-cream-300">{MACRO_LABELS[key]}</span>
              <span className="tabular-nums text-cream-500">{value}/5</span>
            </div>
            <div className="flex gap-1" aria-hidden="true">
              {[1, 2, 3, 4, 5].map((step) => (
                <span
                  key={step}
                  className={cn(
                    "h-2 flex-1 rounded-full",
                    step <= value ? (negative ? "bg-hunger" : "bg-sage-400") : "bg-ink-600",
                  )}
                />
              ))}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function HealthDeltaBadge({ delta }: { delta: number }) {
  const positive = delta > 0;
  const zero = Math.abs(delta) < 0.05;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold",
        zero ? "border-ink-500 text-cream-500" : positive ? "border-health/50 bg-health/15 text-health" : "border-danger/50 bg-danger/15 text-danger",
      )}
    >
      <Heart className="h-3.5 w-3.5" aria-hidden="true" />
      {zero ? "santé stable" : `${positive ? "+" : ""}${delta.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} santé`}
      {zero ? null : positive ? <ArrowUp className="h-3 w-3" aria-hidden="true" /> : <ArrowDown className="h-3 w-3" aria-hidden="true" />}
    </span>
  );
}

/** Full analysis card (used by the feed flow and the history detail). */
export function MealResult({ data, creatureName }: { data: MealResultData; creatureName?: string }) {
  const portion = data.portion && data.portion in PORTION_LABELS ? PORTION_LABELS[data.portion as Portion] : null;
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <ScoreRing score={data.score} />
        <div className="min-w-0 flex-1 space-y-2">
          <span className={cn("inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-wider", VERDICT_STYLE[data.verdict])}>
            {VERDICT_LABELS[data.verdict]}
          </span>
          {portion ? <p className="text-xs text-cream-500">{portion}</p> : null}
          <HealthDeltaBadge delta={data.healthDelta} />
        </div>
      </div>
      {data.foods.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {data.foods.map((food) => (
            <li key={food} className="rounded-full border border-ink-500 bg-ink-700 px-2.5 py-1 text-xs text-cream-300">
              {food}
            </li>
          ))}
        </ul>
      ) : null}
      <MacroBars macros={data.macros} />
      {data.comment ? <p className="text-sm leading-relaxed text-cream-100">{data.comment}</p> : null}
      {data.creatureLine ? (
        <p className="rounded-2xl rounded-bl-sm border border-cream-100/10 bg-ink-900/70 px-4 py-2.5 text-sm italic text-cream-300">
          {creatureName ? <span className="not-italic font-semibold text-cream-100">{creatureName} : </span> : null}« {data.creatureLine} »
        </p>
      ) : null}
    </div>
  );
}
