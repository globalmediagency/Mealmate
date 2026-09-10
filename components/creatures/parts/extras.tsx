import type { ExtraType, SpeciesPalette } from "@/lib/creatures/types";
import type { Layout } from "../layout";
import { withAlpha } from "../layout";

const STAR = "M0 -3.2 L0.8 -0.8 L3.2 0 L0.8 0.8 L0 3.2 L-0.8 0.8 L-3.2 0 L-0.8 -0.8 Z";

export function Sparkle({ x, y, size = 1, color = "#F0D68F", delay = 0 }: { x: number; y: number; size?: number; color?: string; delay?: number }) {
  return (
    <path
      d={STAR}
      transform={`translate(${x} ${y}) scale(${size})`}
      fill={color}
      className="mm-twinkle"
      style={{ animationDelay: `${delay}s` }}
    />
  );
}

type ExtraProps = { type: ExtraType; layout: Layout; palette: SpeciesPalette; uid: string };

/** Extras drawn behind the body. */
export function BackExtra({ type, layout, palette, uid }: ExtraProps) {
  const { neck, body } = layout;
  switch (type) {
    case "aura":
      return (
        <g>
          <circle cx="50" cy={body.cy - 10} r="42" fill={`url(#${uid}-aura)`} className="mm-pulse-soft" />
          <Sparkle x={16} y={40} size={1.1} color={palette.accent} delay={0} />
          <Sparkle x={84} y={34} size={0.9} color={palette.accent} delay={0.7} />
          <Sparkle x={22} y={78} size={0.8} color={palette.accent} delay={1.3} />
          <Sparkle x={82} y={72} size={1.2} color={palette.accent} delay={0.4} />
        </g>
      );
    case "wings": {
      const y = neck[1];
      const wing = (
        <g>
          <path d="M0 0 C14 -20 36 -18 34 -4 C30 4 18 6 2 6 Z" fill="#F7F4EC" stroke={withAlpha(palette.secondary, 0.5)} strokeWidth="0.8" />
          <path d="M4 3 C14 -8 26 -10 31 -5" stroke={withAlpha(palette.secondary, 0.35)} strokeWidth="0.8" fill="none" />
          <path d="M6 5 C14 -2 24 -3 30 0" stroke={withAlpha(palette.secondary, 0.35)} strokeWidth="0.8" fill="none" />
        </g>
      );
      return (
        <g>
          <g transform={`translate(${56} ${y})`}>
            <g className="mm-flap mm-flap-r">{wing}</g>
          </g>
          <g transform={`translate(${44} ${y}) scale(-1 1)`}>
            <g className="mm-flap mm-flap-l">{wing}</g>
          </g>
        </g>
      );
    }
    case "crystals": {
      const gem = "M0 -7 L4 -2 L2.5 5 L-2.5 5 L-4 -2 Z";
      return (
        <g fill={withAlpha(palette.accent, 0.9)} stroke={palette.secondary} strokeWidth="0.7">
          <path d={gem} transform={`translate(${body.cx - body.rx + 2} ${body.cy - 12}) rotate(-25)`} className="mm-twinkle" />
          <path d={gem} transform={`translate(${body.cx + body.rx - 2} ${body.cy - 14}) rotate(25) scale(1.2)`} className="mm-twinkle" style={{ animationDelay: "0.6s" }} />
          <path d={gem} transform={`translate(${body.cx} ${body.cy - body.ry - 2}) scale(0.9)`} className="mm-twinkle" style={{ animationDelay: "1.1s" }} />
        </g>
      );
    }
    case "flames": {
      const flame = (color: string, scale: number) => (
        <path d="M0 0 C-4.5 -6 -2.5 -12 0 -17 C2.5 -12 4.5 -6 0 0 Z" fill={color} transform={`scale(${scale})`} />
      );
      const [tx, ty] = layout.tail;
      return (
        <g transform={`translate(${tx + 8} ${ty - 18})`}>
          <g className="mm-flicker">
            {flame("#E8853A", 1)}
            {flame("#F0D68F", 0.55)}
          </g>
        </g>
      );
    }
    default:
      return null;
  }
}

/** Extras drawn in front / above the head. */
export function FrontExtra({ type, layout, palette }: ExtraProps) {
  if (type !== "halo") return null;
  const y = layout.top - 6;
  return (
    <g className="mm-float">
      <ellipse cx={layout.head.cx} cy={y} rx="11" ry="3.4" stroke={palette.accent} strokeWidth="2.2" fill="none" />
      <ellipse cx={layout.head.cx} cy={y} rx="11" ry="3.4" stroke="#fff" strokeWidth="0.8" fill="none" opacity="0.6" />
    </g>
  );
}
