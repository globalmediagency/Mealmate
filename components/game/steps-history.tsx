import { formatDayLabel } from "@/lib/game/time";
import type { DailySteps } from "@/lib/steps/service";
import { cn } from "@/lib/utils/cn";

type StepsHistoryProps = { history: DailySteps[]; className?: string };

/** Simple bar chart of daily steps (no charting library needed). */
export function StepsHistory({ history, className }: StepsHistoryProps) {
  const max = Math.max(1000, ...history.map((d) => d.steps));
  const total = history.reduce((sum, d) => sum + d.steps, 0);
  const activeDays = history.filter((d) => d.steps > 0).length;
  const average = activeDays > 0 ? Math.round(total / activeDays) : 0;

  return (
    <div className={className}>
      <div className="flex h-36 items-end gap-1" role="img" aria-label="Pas par jour sur 14 jours">
        {history.map((day, index) => {
          const height = Math.max(day.steps > 0 ? 6 : 2, Math.round((day.steps / max) * 100));
          const isToday = index === history.length - 1;
          return (
            <div key={day.date} className="flex h-full flex-1 flex-col items-center justify-end gap-1" title={`${formatDayLabel(day.date)} : ${day.steps.toLocaleString("fr-FR")} pas`}>
              <div
                className={cn("w-full rounded-t-md", isToday ? "bg-brass-400" : day.steps > 0 ? "bg-sage-500" : "bg-ink-500")}
                style={{ height: `${height}%` }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-cream-700">
        <span>{formatDayLabel(history[0]?.date ?? "")}</span>
        <span>Aujourd&apos;hui</span>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-2 text-center">
        <div className="rounded-2xl bg-ink-900/70 p-3">
          <dt className="text-[11px] uppercase tracking-wider text-cream-700">Total 14 jours</dt>
          <dd className="mt-1 text-lg font-semibold tabular-nums text-cream-50">{total.toLocaleString("fr-FR")}</dd>
        </div>
        <div className="rounded-2xl bg-ink-900/70 p-3">
          <dt className="text-[11px] uppercase tracking-wider text-cream-700">Moyenne / jour actif</dt>
          <dd className="mt-1 text-lg font-semibold tabular-nums text-cream-50">{average.toLocaleString("fr-FR")}</dd>
        </div>
      </dl>
    </div>
  );
}
