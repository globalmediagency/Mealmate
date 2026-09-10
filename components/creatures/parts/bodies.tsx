import type { SpeciesPalette } from "@/lib/creatures/types";
import type { Layout } from "../layout";
import { shade } from "../layout";

type BodyProps = { layout: Layout; palette: SpeciesPalette; gradientId: string; serpent?: boolean };

/** Main body shape (and head circle for distinct-head bodies is drawn separately). */
export function BodyShape({ layout, palette, gradientId, serpent }: BodyProps) {
  const { body } = layout;
  if (serpent) {
    return (
      <g>
        <ellipse cx={body.cx} cy={body.cy} rx={body.rx} ry={body.ry} fill={`url(#${gradientId})`} />
        <path
          d={`M${body.cx - 8} ${body.cy - 6} C${body.cx - 6} ${body.cy - 24} ${layout.head.cx - 8} ${layout.head.cy + 14} ${layout.head.cx} ${layout.head.cy + 10}`}
          stroke={palette.primary}
          strokeWidth="16"
          strokeLinecap="round"
          fill="none"
        />
        <ellipse cx={body.cx} cy={body.cy + 4} rx={body.rx * 0.6} ry={body.ry * 0.4} fill={shade(palette.primary, 0.25)} opacity="0.5" />
      </g>
    );
  }
  if (body.path) {
    return <path d={body.path} fill={`url(#${gradientId})`} />;
  }
  return <ellipse cx={body.cx} cy={body.cy} rx={body.rx} ry={body.ry} fill={`url(#${gradientId})`} />;
}

export function HeadShape({ layout, gradientId }: { layout: Layout; gradientId: string }) {
  const { head } = layout;
  return <circle cx={head.cx} cy={head.cy} r={head.r} fill={`url(#${gradientId})`} />;
}
