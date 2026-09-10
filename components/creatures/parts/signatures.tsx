import type { SignatureType, SpeciesPalette } from "@/lib/creatures/types";
import type { Layout } from "../layout";

type SignatureProps = { type: SignatureType; layout: Layout; palette: SpeciesPalette };

const BRASS = "#E8C36A";
const BRASS_DARK = "#A6823A";

/** Signature items worn from the "Sage" stage (head slot). */
export function HeadSignature({ type, layout, palette }: SignatureProps) {
  const { head, top, eyeY, eyeGap } = layout;
  switch (type) {
    case "leaf":
      return (
        <g transform={`translate(${head.cx + 4} ${top + 1})`}>
          <path d="M0 0 C-6 -2 -8 -10 -2 -14 C4 -11 4 -3 0 0 Z" fill="#7FB77E" />
          <path d="M-1 -1 C-3 -5 -3 -9 -2 -12" stroke="#3F6B3E" strokeWidth="0.7" fill="none" />
        </g>
      );
    case "crown":
      return (
        <g transform={`translate(${head.cx} ${top + 1})`}>
          <path d="M-9 3 L-9 -7 L-4 -2 L0 -9 L4 -2 L9 -7 L9 3 Z" fill={BRASS} stroke={BRASS_DARK} strokeWidth="0.8" strokeLinejoin="round" />
          <circle cx="-5" cy="0" r="1.1" fill="#D9666B" />
          <circle cx="0" cy="-1" r="1.1" fill="#7DA7D9" />
          <circle cx="5" cy="0" r="1.1" fill="#7FB77E" />
        </g>
      );
    case "flower":
      return (
        <g transform={`translate(${head.cx - head.r * 0.72} ${top + 7})`}>
          {[0, 72, 144, 216, 288].map((angle) => (
            <circle key={angle} cx="0" cy="-3.2" r="2.3" fill={palette.accent} transform={`rotate(${angle})`} />
          ))}
          <circle r="1.8" fill={BRASS} />
        </g>
      );
    case "monocle":
      return (
        <g transform={`translate(${50 + eyeGap} ${eyeY})`}>
          <circle r="6.4" stroke={BRASS} strokeWidth="1.4" fill="none" />
          <path d="M5 4 q3 6 1 12" stroke={BRASS} strokeWidth="0.8" fill="none" />
        </g>
      );
    default:
      return null;
  }
}

/** Signature items worn at the neck / chest (body group). */
export function NeckSignature({ type, layout, palette }: SignatureProps) {
  const [nx, ny] = layout.neck;
  switch (type) {
    case "bow":
      return (
        <g transform={`translate(${nx} ${ny + 2})`}>
          <path d="M0 0 L-7.5 -4.5 L-7 4.5 Z M0 0 L7.5 -4.5 L7 4.5 Z" fill={palette.accent} />
          <circle r="2" fill={palette.secondary} />
        </g>
      );
    case "scarf":
      return (
        <g transform={`translate(${nx} ${ny + 1})`}>
          <path d="M-13 -2 Q0 5 13 -2 Q0 10 -13 -2 Z" fill={palette.accent} />
          <path d="M5 4 L8.5 14 L3 12.5 Z" fill={palette.accent} />
        </g>
      );
    case "bell":
      return (
        <g transform={`translate(${nx} ${ny + 3})`}>
          <path d="M-13 -4 Q0 2 13 -4" stroke="#D9666B" strokeWidth="2" fill="none" />
          <path d="M-4 3 C-4 -3 4 -3 4 3 L5.2 5.5 L-5.2 5.5 Z" fill={BRASS} stroke={BRASS_DARK} strokeWidth="0.6" />
          <circle cx="0" cy="5.6" r="1.1" fill={BRASS_DARK} />
        </g>
      );
    case "star_pin":
      return (
        <path
          d="M0 -4.2 L1.1 -1.1 L4.2 0 L1.1 1.1 L0 4.2 L-1.1 1.1 L-4.2 0 L-1.1 -1.1 Z"
          transform={`translate(${nx - 8} ${ny + 8})`}
          fill={BRASS}
          stroke={BRASS_DARK}
          strokeWidth="0.5"
        />
      );
    case "pearl":
      return (
        <g transform={`translate(${nx} ${ny + 2})`}>
          {[-12, -8, -4, 0, 4, 8, 12].map((x) => (
            <circle key={x} cx={x} cy={Math.abs(x) * -0.18 + 2.5} r="1.7" fill="#F7F4EC" stroke="#D9D5C8" strokeWidth="0.4" />
          ))}
        </g>
      );
    case "bandana":
      return (
        <g transform={`translate(${nx} ${ny + 1})`}>
          <path d="M-13 -1 Q0 5 13 -1 L1 13 Z" fill="#D9666B" />
          <circle cx="-4" cy="4" r="0.9" fill="#F7F4EC" />
          <circle cx="3" cy="6" r="0.9" fill="#F7F4EC" />
          <circle cx="0" cy="1.5" r="0.9" fill="#F7F4EC" />
        </g>
      );
    default:
      return null;
  }
}
