import type { MarkingType, SpeciesPalette } from "@/lib/creatures/types";
import type { Layout } from "../layout";
import { withAlpha } from "../layout";

type MarkingProps = { type: MarkingType; layout: Layout; palette: SpeciesPalette; opacity: number };

/** Markings drawn on the body (in the body group). */
export function BodyMarkings({ type, layout, palette, opacity }: MarkingProps) {
  if (opacity <= 0) return null;
  const { body } = layout;
  switch (type) {
    case "belly_patch":
      return (
        <ellipse
          cx={body.cx}
          cy={body.cy + body.ry * 0.2}
          rx={body.rx * 0.55}
          ry={body.ry * 0.5}
          fill={withAlpha(palette.accent, 0.55 * opacity)}
        />
      );
    case "spots":
      return (
        <g fill={withAlpha(palette.secondary, 0.55 * opacity)}>
          <circle cx={body.cx - 9} cy={body.cy - 4} r="3.2" />
          <circle cx={body.cx + 10} cy={body.cy + 2} r="2.6" />
          <circle cx={body.cx - 2} cy={body.cy + 9} r="2.1" />
          <circle cx={body.cx + 4} cy={body.cy - 10} r="1.9" />
        </g>
      );
    case "stripes":
      return (
        <g stroke={withAlpha(palette.secondary, 0.8 * opacity)} strokeWidth="2.4" strokeLinecap="round" fill="none">
          <path d={`M${body.cx - body.rx + 3} ${body.cy - 6} q4 3 3 8`} />
          <path d={`M${body.cx + body.rx - 3} ${body.cy - 6} q-4 3 -3 8`} />
        </g>
      );
    case "mask":
      // Light muzzle patch (the blaze on the head is drawn by HeadMarkings).
      return (
        <ellipse
          cx="50"
          cy={layout.mouthY - 0.5}
          rx="8.5"
          ry="5.6"
          fill={withAlpha(palette.secondary, 0.95 * opacity)}
        />
      );
    default:
      return null;
  }
}

/** Markings drawn on the head (in the head group, under the face). */
export function HeadMarkings({ type, layout, palette, opacity }: MarkingProps) {
  if (opacity <= 0) return null;
  const { head } = layout;
  switch (type) {
    case "stripes":
      return (
        <g stroke={withAlpha(palette.secondary, 0.8 * opacity)} strokeWidth="2.4" strokeLinecap="round" fill="none">
          <path d={`M${head.cx - 6} ${head.cy - head.r + 5} l1.5 6`} />
          <path d={`M${head.cx} ${head.cy - head.r + 3} l0 6.5`} />
          <path d={`M${head.cx + 6} ${head.cy - head.r + 5} l-1.5 6`} />
        </g>
      );
    case "mask":
      return (
        <rect
          x="47"
          y={head.cy - head.r * 0.7}
          width="6"
          height={head.r * 0.9}
          rx="3"
          fill={withAlpha(palette.secondary, 0.9 * opacity)}
        />
      );
    case "crescent": {
      const cx = head.cx;
      const cy = head.cy - head.r * 0.58;
      return (
        <path
          d={`M${cx + 1} ${cy - 4} a4 4 0 1 0 0 8 a3 3 0 1 1 0 -8 z`}
          fill={withAlpha(palette.accent, opacity)}
        />
      );
    }
    default:
      return null;
  }
}

/** Markings drawn behind the creature (shell, spikes). */
export function BackMarkings({ type, layout, palette, opacity }: MarkingProps) {
  if (opacity <= 0) return null;
  const { body, head } = layout;
  switch (type) {
    case "shell": {
      const cx = body.cx;
      const cy = body.cy - 8;
      const r = body.rx + 3;
      const hex = (x: number, y: number, s: number) =>
        `M${x} ${y - s} L${x + s * 0.87} ${y - s / 2} L${x + s * 0.87} ${y + s / 2} L${x} ${y + s} L${x - s * 0.87} ${y + s / 2} L${x - s * 0.87} ${y - s / 2} Z`;
      return (
        <g opacity={opacity}>
          <circle cx={cx} cy={cy} r={r} fill={palette.secondary} />
          <g stroke={withAlpha(palette.accent, 0.7)} strokeWidth="1.2" fill="none">
            <path d={hex(cx, cy - r * 0.45, 6)} />
            <path d={hex(cx - r * 0.55, cy + r * 0.1, 5)} />
            <path d={hex(cx + r * 0.55, cy + r * 0.1, 5)} />
          </g>
        </g>
      );
    }
    case "spikes": {
      const r = head.r;
      const points: string[] = [];
      const steps = 14;
      for (let i = 0; i <= steps; i += 1) {
        const angle = Math.PI + (Math.PI * i) / steps; // 180° → 360° (top half)
        const radius = i % 2 === 0 ? r + 1 : r + 8;
        points.push(`${(head.cx + Math.cos(angle) * radius).toFixed(1)} ${(head.cy + Math.sin(angle) * radius).toFixed(1)}`);
      }
      return <path d={`M${points.join(" L")} Z`} fill={palette.secondary} opacity={opacity} />;
    }
    default:
      return null;
  }
}
