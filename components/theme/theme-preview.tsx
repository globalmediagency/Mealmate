import { fontStack, themeSwatches, type Theme } from "@/lib/themes/catalog";
import { cn } from "@/lib/utils/cn";

/**
 * A miniature of a design, painted with its own colours and typefaces (every
 * family is declared by the root layout, so the sample text really uses it):
 * page, a card with a title, a line of text, the accent and highlight pills.
 */
export function ThemePreview({ theme, className }: { theme: Theme; className?: string }) {
  const s = themeSwatches(theme);
  const { cream, sage, brass, ink } = theme.colors;
  return (
    <div
      aria-hidden="true"
      className={cn("overflow-hidden rounded-2xl border", className)}
      style={{ backgroundColor: s.page, borderColor: ink["600"], color: s.text, fontFamily: fontStack(theme.fonts.sans) }}
    >
      <div className="m-2 rounded-xl border p-2.5" style={{ backgroundColor: s.card, borderColor: ink["600"], boxShadow: theme.shadowCard }}>
        <p className="text-base font-semibold leading-tight" style={{ fontFamily: fontStack(theme.fonts.display), color: cream["50"] }}>
          {theme.name}
        </p>
        <p className="mt-0.5 text-[10px] leading-snug" style={{ color: cream["500"] }}>
          Miso a faim, un petit repas ?
        </p>
        <div className="mt-2 flex items-center gap-1.5">
          <span className="h-5 flex-1 rounded-md" style={{ backgroundColor: sage["500"] }} />
          <span className="h-5 flex-1 rounded-md" style={{ backgroundColor: brass["400"] }} />
          <span className="h-5 w-5 rounded-md border" style={{ backgroundColor: ink["700"], borderColor: ink["500"] }} />
        </div>
      </div>
      <ul className="flex gap-1 px-2 pb-2">
        {[s.page, ink["700"], sage["300"], brass["300"], cream["50"]].map((color, i) => (
          <li key={i} className="h-2.5 flex-1 rounded-full border" style={{ backgroundColor: color, borderColor: ink["600"] }} />
        ))}
      </ul>
    </div>
  );
}
