import type { EarType, SpeciesPalette } from "@/lib/creatures/types";
import type { Layout } from "../layout";
import { shade, withAlpha } from "../layout";

type EarsProps = { type: EarType; layout: Layout; palette: SpeciesPalette };

function Ear({ type, palette }: { type: EarType; palette: SpeciesPalette }) {
  const inner = withAlpha(palette.accent, 0.75);
  switch (type) {
    case "cat":
      return (
        <g>
          <path d="M0 3 L-6 -14 L10 -4 Z" fill={palette.primary} />
          <path d="M0.5 0.5 L-3 -8.5 L6 -3 Z" fill={inner} />
        </g>
      );
    case "fox":
      return (
        <g>
          <path d="M0 4 L-8 -19 L12 -5 Z" fill={palette.primary} />
          <path d="M-5.5 -11 L-8 -19 L0 -14 Z" fill={palette.secondary} />
          <path d="M0.5 1 L-4 -10 L7 -3 Z" fill={inner} />
        </g>
      );
    case "rabbit":
      return (
        <g transform="rotate(14)">
          <ellipse cx="0" cy="-10" rx="4.6" ry="13.5" fill={palette.primary} />
          <ellipse cx="0" cy="-9" rx="2.3" ry="9.5" fill={inner} />
        </g>
      );
    case "round":
      return (
        <g>
          <circle cx="0" cy="-2" r="6.5" fill={palette.primary} />
          <circle cx="0" cy="-1.5" r="3.3" fill={inner} />
        </g>
      );
    case "horns":
      return (
        <path
          d="M0 3 C-2 -5 4 -13 11 -15 C6 -9 5 -3 4 4 Z"
          fill={palette.secondary}
          stroke={shade(palette.secondary, -0.25)}
          strokeWidth="0.6"
        />
      );
    case "fold":
      return (
        <g>
          <path d="M-2 -2 C2 -11 15 -9 13 6 C12 14 2 15 -1 7 Z" fill={palette.secondary} />
          <path d="M1 0 C4 -6 11 -5 10 5 C9 10 3 11 1 5 Z" fill={inner} />
        </g>
      );
    case "pig":
      return (
        <g>
          <path d="M0 3 L-4 -10 L10 -3 Z" fill={palette.primary} />
          <path d="M0.5 1 L-2 -6 L6 -2 Z" fill={withAlpha(palette.secondary, 0.7)} />
        </g>
      );
    case "antlers":
      return (
        <g stroke={palette.secondary} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" fill="none">
          <path d="M0 3 L2 -8 L-3 -15" />
          <path d="M2 -8 L6 -17" />
          <path d="M1 -3 L7 -6" />
        </g>
      );
    case "horn":
      // Small pointed ears; the single horn is drawn once by <Ears /> (see below).
      return (
        <g>
          <path d="M0 3 L-4 -9 L7 -3 Z" fill={palette.primary} />
          <path d="M0.5 1 L-2 -5.5 L4 -2 Z" fill={inner} />
        </g>
      );
    case "none":
      return null;
  }
}

export function Ears({ type, layout, palette }: EarsProps) {
  if (type === "none") return null;
  const { left, right, tilt } = layout.ears;
  return (
    <g>
      {type === "horn" ? (
        <g transform={`translate(${layout.head.cx} ${layout.top + 2})`}>
          <path d="M-3.2 1 L0 -17 L3.2 1 Z" fill={palette.accent} stroke={shade(palette.accent, -0.3)} strokeWidth="0.6" />
          <path d="M-2 -3 L2 -5 M-1.5 -8 L1.5 -10" stroke={shade(palette.accent, -0.3)} strokeWidth="0.7" strokeLinecap="round" />
        </g>
      ) : null}
      <g transform={`translate(${left[0]} ${left[1]}) scale(-1 1) rotate(${-tilt})`}>
        <Ear type={type} palette={palette} />
      </g>
      <g transform={`translate(${right[0]} ${right[1]}) rotate(${-tilt})`}>
        <Ear type={type} palette={palette} />
      </g>
    </g>
  );
}
