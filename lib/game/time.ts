import { GAME_TIMEZONE } from "./config";

const dateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: GAME_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Calendar date (YYYY-MM-DD) of an instant in the game timezone (Europe/Paris). */
export function gameDate(instant: Date = new Date()): string {
  return dateFormatter.format(instant);
}

/** Shifts a YYYY-MM-DD string by `days` (calendar arithmetic, no timezone). */
export function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d + days));
  return utc.toISOString().slice(0, 10);
}

/** Whole days between two instants (floored). */
export function daysBetween(from: Date, to: Date): number {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / 86_400_000));
}

/** Fractional hours between two instants (never negative). */
export function hoursBetween(from: Date, to: Date): number {
  return Math.max(0, (to.getTime() - from.getTime()) / 3_600_000);
}

/** Very short label "9/9" for dense axes. */
export function shortDayLabel(date: string): string {
  const [, m, d] = date.split("-").map(Number);
  return `${d}/${m}`;
}

/** Short French label for a YYYY-MM-DD date ("lun. 9 sept."). */
export function formatDayLabel(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}
