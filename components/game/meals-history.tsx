"use client";

import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { VERDICT_LABELS, type Verdict } from "@/lib/ai/meal-schema";
import { TIER_CONFIG, type Tier } from "@/lib/game/config";
import { formatDayLabel, shortDayLabel } from "@/lib/game/time";
import type { MealStats, MealView } from "@/lib/meals/service";
import { cn } from "@/lib/utils/cn";
import { HealthDeltaBadge, MealResult, scoreColor } from "./meal-result";

type MealsHistoryProps = { meals: MealView[]; stats: MealStats; tier: Tier | null };

const timeFormat = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });

export function MealsHistory({ meals, stats, tier }: MealsHistoryProps) {
  const [range, setRange] = useState<7 | 30>(7);
  const [open, setOpen] = useState<string | null>(null);
  const threshold = tier ? TIER_CONFIG[tier].healthyScoreThreshold : null;

  const data = useMemo(
    () =>
      stats.daily.slice(-range).map((d) => ({
        date: d.date,
        label: range === 7 ? formatDayLabel(d.date).split(" ")[0] : shortDayLabel(d.date),
        score: d.average,
        count: d.count,
      })),
    [stats.daily, range],
  );

  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-ink-600/80 bg-ink-800/90 p-4 shadow-card">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-cream-700">Moyenne 7 jours</p>
            <p className="font-display text-3xl font-semibold text-cream-50">
              {stats.weekAverage ?? "–"}
              <span className="ml-1 text-sm font-normal text-cream-500">/ 100</span>
            </p>
            <p className="text-xs text-cream-500">
              {stats.weekCount} repas cette semaine{stats.monthAverage !== null ? ` · ${stats.monthAverage} sur 30 jours` : ""}
            </p>
          </div>
          <div className="flex rounded-xl border border-ink-500 p-0.5 text-xs" role="tablist" aria-label="Période">
            {([7, 30] as const).map((r) => (
              <button
                key={r}
                type="button"
                role="tab"
                aria-selected={range === r}
                onClick={() => setRange(r)}
                className={cn("min-h-9 rounded-lg px-3 font-semibold", range === r ? "bg-sage-800/60 text-sage-200" : "text-cream-500")}
              >
                {r} j
              </button>
            ))}
          </div>
        </div>
        <div className="mt-3 h-44">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}>
              <defs>
                <linearGradient id="meal-score-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#8ba07a" stopOpacity={0.45} />
                  <stop offset="100%" stopColor="#8ba07a" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#242b24" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: "#6f776c", fontSize: 10 }} tickLine={false} axisLine={false} interval={range === 7 ? 0 : 6} />
              <YAxis domain={[0, 100]} tick={{ fill: "#6f776c", fontSize: 10 }} tickLine={false} axisLine={false} ticks={[0, 50, 100]} />
              {threshold !== null ? <ReferenceLine y={threshold} stroke="#e8c36a" strokeDasharray="4 4" /> : null}
              <Tooltip
                cursor={{ stroke: "#465246" }}
                contentStyle={{ background: "#121612", border: "1px solid #303a30", borderRadius: 12, fontSize: 12, color: "#f2efe6" }}
                formatter={(value) => [value === null ? "–" : `${value} / 100`, "Score moyen"]}
                labelFormatter={(label) => String(label)}
              />
              <Area type="monotone" dataKey="score" stroke="#a9bc99" strokeWidth={2.5} fill="url(#meal-score-fill)" connectNulls dot={{ r: 3, fill: "#a9bc99", strokeWidth: 0 }} activeDot={{ r: 5 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        {threshold !== null ? (
          <p className="mt-1 text-[11px] text-cream-700">La ligne dorée est le seuil « repas sain » de ton niveau ({threshold}/100).</p>
        ) : null}
      </section>

      {meals.length === 0 ? (
        <p className="rounded-3xl border border-ink-600/80 bg-ink-800/70 p-6 text-center text-sm text-cream-500">
          Aucun repas pour l&apos;instant. Ta première photo t&apos;attend !
        </p>
      ) : (
        <ul className="space-y-2">
          {meals.map((meal) => {
            const expanded = open === meal.id;
            return (
              <li key={meal.id} className="rounded-3xl border border-ink-600/80 bg-ink-800/90 shadow-card">
                <button
                  type="button"
                  onClick={() => setOpen(expanded ? null : meal.id)}
                  aria-expanded={expanded}
                  className="flex w-full items-center gap-3 p-3 text-left"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={meal.imageUrl} alt="" className="h-16 w-16 shrink-0 rounded-2xl object-cover" loading="lazy" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-cream-50">{meal.foods.slice(0, 3).join(", ") || VERDICT_LABELS[meal.verdict as Verdict]}</p>
                    <p className="text-xs text-cream-500">{timeFormat.format(new Date(meal.createdAt))}</p>
                    <div className="mt-1">
                      <HealthDeltaBadge delta={meal.healthDelta} />
                    </div>
                  </div>
                  <span className="shrink-0 font-display text-2xl font-semibold tabular-nums" style={{ color: scoreColor(meal.score) }}>
                    {meal.score}
                  </span>
                </button>
                {expanded ? (
                  <div className="border-t border-ink-600/80 p-4">
                    <MealResult
                      data={{
                        score: meal.score,
                        verdict: meal.verdict as Verdict,
                        foods: meal.foods,
                        macros: meal.macros,
                        portion: meal.portion,
                        comment: meal.comment,
                        creatureLine: meal.creatureLine,
                        healthDelta: meal.healthDelta,
                      }}
                    />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
