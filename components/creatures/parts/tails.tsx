import type { SpeciesPalette, TailType } from "@/lib/creatures/types";
import type { Layout } from "../layout";
import { withAlpha } from "../layout";

type TailProps = { type: TailType; layout: Layout; palette: SpeciesPalette };

export function Tail({ type, layout, palette }: TailProps) {
  if (type === "none") return null;
  const [x, y] = layout.tail;
  let content: React.ReactNode;
  switch (type) {
    case "curl":
      content = (
        <g>
          <path d="M0 0 C12 -2 19 -14 10 -21" stroke={palette.primary} strokeWidth="5.5" strokeLinecap="round" fill="none" />
          <path d="M10 -21 C5 -25 -2 -19 3 -13" stroke={palette.secondary} strokeWidth="5.5" strokeLinecap="round" fill="none" />
        </g>
      );
      break;
    case "fluffy":
      content = (
        <g>
          <ellipse cx="7" cy="-9" rx="7" ry="12.5" transform="rotate(38 7 -9)" fill={palette.primary} />
          <ellipse cx="10" cy="-16" rx="3.6" ry="5.5" transform="rotate(38 10 -16)" fill={withAlpha(palette.accent, 0.85)} />
        </g>
      );
      break;
    case "thin":
      content = (
        <path d="M0 0 C6 -3 7 -9 2 -9 C-1.5 -9 -1.5 -4 3.5 -4" stroke={palette.secondary} strokeWidth="2" strokeLinecap="round" fill="none" />
      );
      break;
    case "feather":
      content = (
        <g fill={palette.secondary}>
          <ellipse cx="4" cy="-6" rx="2.3" ry="6.5" transform="rotate(-25)" />
          <ellipse cx="4" cy="-6" rx="2.3" ry="6.5" transform="rotate(5)" />
          <ellipse cx="4" cy="-6" rx="2.3" ry="6.5" transform="rotate(35)" />
        </g>
      );
      break;
    case "stub":
      content = (
        <g>
          <circle cx="2.5" cy="-3" r="4" fill={palette.primary} />
          <circle cx="2.5" cy="-3" r="2" fill={withAlpha(palette.secondary, 0.9)} />
        </g>
      );
      break;
    case "puff":
      content = (
        <g>
          <circle cx="2.5" cy="-4" r="5.2" fill="#F7F4EC" />
          <circle cx="1.5" cy="-5" r="2.2" fill={withAlpha(palette.accent, 0.6)} />
        </g>
      );
      break;
    default:
      content = null;
  }
  return (
    <g transform={`translate(${x} ${y})`}>
      <g className="mm-tail">{content}</g>
    </g>
  );
}
