"use client";

import { useState } from "react";
import { FoodIcon } from "@/components/food/food-icon";
import { classifyFood, FOOD_KIND_LABELS } from "@/lib/meals/food-icons";

/** Type a food name as Gemini would return it and see which drawing the animation picks. */
export function FoodTester() {
  const [value, setValue] = useState("");
  const kind = value.trim() ? classifyFood(value) : null;
  return (
    <section className="rounded-3xl border border-ink-600/80 bg-ink-800/90 p-4 shadow-card">
      <h2 className="font-display text-xl text-cream-50">Tester un nom d&apos;aliment</h2>
      <p className="mt-1 text-xs text-cream-500">Tape un aliment tel que l&apos;analyse pourrait le nommer (« purée », « bœuf bourguignon », « thé vert »…) pour voir le dessin utilisé.</p>
      <div className="mt-3 flex items-center gap-3">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="ex. saumon grillé"
          aria-label="Nom d'aliment à tester"
          className="min-h-11 w-full rounded-xl border border-ink-500 bg-ink-900 px-3 text-base text-cream-50 placeholder:text-cream-700"
        />
        <div className="flex w-28 shrink-0 flex-col items-center gap-1 text-center">
          {kind ? (
            <>
              <FoodIcon kind={kind} size={48} />
              <span className="text-[11px] text-cream-300">{FOOD_KIND_LABELS[kind]}</span>
            </>
          ) : (
            <span className="text-[11px] text-cream-700">—</span>
          )}
        </div>
      </div>
    </section>
  );
}
