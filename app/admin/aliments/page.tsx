import type { Metadata } from "next";
import { FoodTester } from "@/components/admin/food-tester";
import { FoodIcon } from "@/components/food/food-icon";
import { requireAdmin } from "@/lib/admin/auth";
import { FOOD_FAMILIES, FOOD_KIND_LABELS, FOOD_KINDS } from "@/lib/meals/food-icons";

export const metadata: Metadata = { title: "Aliments" };
export const dynamic = "force-dynamic";

/** Catalogue of the food drawings used by the feeding animation. */
export default async function AdminFoodPage() {
  await requireAdmin();
  return (
    <div className="space-y-6 animate-rise">
      <div>
        <h1 className="font-display text-3xl font-semibold text-cream-50">Aliments</h1>
        <p className="mt-1 text-sm text-cream-500">
          {FOOD_KINDS.length - 1} dessins d&apos;aliments plus une assiette de repli. Après l&apos;analyse d&apos;une photo, les trois premiers aliments reconnus sont dessinés puis lancés aux créatures ;
          un aliment sans dessin dédié tombe sur le dessin de sa famille (« fruits », « légumes ») ou sur l&apos;assiette.
        </p>
      </div>

      <FoodTester />

      {FOOD_FAMILIES.map((family) => (
        <section key={family.id}>
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="font-display text-xl text-cream-50">{family.label}</h2>
            <span className="text-xs text-cream-700">{family.kinds.length}</span>
          </div>
          <ul className="grid grid-cols-4 gap-2 sm:grid-cols-6">
            {family.kinds.map((kind) => (
              <li key={kind} className="flex flex-col items-center gap-1 rounded-2xl border border-ink-600/60 bg-ink-800/90 p-2 text-center">
                <FoodIcon kind={kind} size={48} />
                <span className="text-[11px] leading-tight text-cream-300">{FOOD_KIND_LABELS[kind]}</span>
                <span className="text-[10px] text-cream-700">{kind}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
