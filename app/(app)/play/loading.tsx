/** Skeleton of the games hub and its doors: title, counter, two big tiles, a few cards. */
export default function Loading() {
  return (
    <div className="space-y-4 pt-2" aria-busy="true" aria-label="Chargement">
      <div className="h-8 w-48 animate-pulse rounded-xl bg-ink-700/80" />
      <div className="h-12 animate-pulse rounded-2xl bg-ink-800/90" />
      <div className="grid grid-cols-2 gap-3">
        <div className="h-40 animate-pulse rounded-3xl bg-ink-800/90" />
        <div className="h-40 animate-pulse rounded-3xl bg-ink-800/90" />
      </div>
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className="h-14 animate-pulse rounded-3xl bg-ink-800/90" />
      ))}
    </div>
  );
}
