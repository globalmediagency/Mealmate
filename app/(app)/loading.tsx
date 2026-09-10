/** Lightweight skeleton shown while a page's data loads (Next.js streaming). */
export default function Loading() {
  return (
    <div className="space-y-4 pt-2" aria-busy="true" aria-label="Chargement">
      <div className="h-8 w-40 animate-pulse rounded-xl bg-ink-700/80" />
      <div className="h-4 w-56 animate-pulse rounded-lg bg-ink-700/60" />
      <div className="h-64 animate-pulse rounded-3xl bg-ink-800/90" />
      <div className="h-32 animate-pulse rounded-3xl bg-ink-800/90" />
      <div className="grid grid-cols-3 gap-2">
        <div className="h-14 animate-pulse rounded-2xl bg-ink-700/70" />
        <div className="h-14 animate-pulse rounded-2xl bg-ink-700/70" />
        <div className="h-14 animate-pulse rounded-2xl bg-ink-700/70" />
      </div>
    </div>
  );
}
