"use client";

import { useRouter } from "next/navigation";

type Props = { speciesIds: { id: string; name: string }[]; current?: string; animated: boolean };

export function DevGalleryControls({ speciesIds, current, animated }: Props) {
  const router = useRouter();
  function navigate(species: string, anim: boolean) {
    const params = new URLSearchParams();
    if (species) params.set("species", species);
    if (!anim) params.set("animated", "0");
    router.push(`/dev/creatures${params.size ? `?${params}` : ""}`);
  }
  return (
    <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
      <select
        value={current ?? ""}
        onChange={(e) => navigate(e.target.value, animated)}
        className="min-h-11 rounded-xl border border-ink-500 bg-ink-900 px-3 text-cream-100"
      >
        <option value="">Toutes les espèces</option>
        {speciesIds.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <label className="inline-flex min-h-11 items-center gap-2 text-cream-300">
        <input type="checkbox" checked={animated} onChange={(e) => navigate(current ?? "", e.target.checked)} />
        Animations
      </label>
    </div>
  );
}
