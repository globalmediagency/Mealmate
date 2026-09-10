import type { Layout } from "../layout";
import { Sparkle } from "./extras";

const HEART =
  "M0 3.2 C-3.2 0.6 -4.2 -1.2 -3 -2.6 C-2 -3.7 -0.6 -3.4 0 -2.3 C0.6 -3.4 2 -3.7 3 -2.6 C4.2 -1.2 3.2 0.6 0 3.2 Z";

/** Sick-state overlays: sweat drop + small cloud. */
export function SickOverlay({ layout }: { layout: Layout }) {
  const { head, top, eyeY } = layout;
  return (
    <g>
      <g transform={`translate(${head.cx + head.r * 0.85} ${eyeY - 7})`}>
        <path d="M0 -4.5 C2 -1.5 3.2 0.5 3.2 2.4 a3.2 3.2 0 0 1 -6.4 0 C-3.2 0.5 -2 -1.5 0 -4.5 Z" fill="#7DA7D9" className="mm-drip" />
      </g>
      <g transform={`translate(${head.cx - head.r - 10} ${top + 4})`} className="mm-float" opacity="0.85">
        <path d="M0 6 a4 4 0 0 1 3 -7 a5 5 0 0 1 9 -1 a4.5 4.5 0 0 1 4 8 Z" fill="#6f776c" />
      </g>
    </g>
  );
}

/** Sparkles around a "Sage" creature. */
export function SageAura({ layout }: { layout: Layout }) {
  const { body } = layout;
  return (
    <g>
      <circle cx="50" cy={body.cy - 12} r="44" fill="none" stroke="#F0D68F" strokeWidth="0.8" strokeDasharray="2 4" opacity="0.5" className="mm-spin-slow" />
      <Sparkle x={12} y={30} size={1} delay={0.2} />
      <Sparkle x={88} y={26} size={1.2} delay={0.9} />
      <Sparkle x={90} y={70} size={0.8} delay={1.4} />
      <Sparkle x={10} y={66} size={0.9} delay={0.5} />
    </g>
  );
}

export type Reaction = "eat" | "play" | "heal" | "disgust" | "tap";

/** One-shot particles shown during a reaction (hearts, puff, sparkles). */
export function ReactionParticles({ reaction, layout }: { reaction: Reaction; layout: Layout }) {
  const { head, top } = layout;
  switch (reaction) {
    case "eat":
    case "tap":
      return (
        <g>
          {[-12, 0, 12].map((dx, i) => (
            <path
              key={dx}
              d={HEART}
              fill="#E38EA5"
              transform={`translate(${head.cx + dx} ${top - 2}) scale(${1 + i * 0.15})`}
              className="mm-fx-rise"
              style={{ animationDelay: `${i * 0.12}s` }}
            />
          ))}
        </g>
      );
    case "heal":
      return (
        <g>
          <Sparkle x={head.cx - 22} y={head.cy - 6} size={1.3} color="#7FB77E" />
          <Sparkle x={head.cx + 22} y={head.cy - 10} size={1.1} color="#F0D68F" delay={0.2} />
          <Sparkle x={head.cx} y={top - 8} size={1.5} color="#F0D68F" delay={0.35} />
          <Sparkle x={head.cx - 14} y={head.cy + 26} size={0.9} color="#7FB77E" delay={0.5} />
          <Sparkle x={head.cx + 16} y={head.cy + 24} size={1} color="#F0D68F" delay={0.65} />
        </g>
      );
    case "disgust":
      return (
        <g transform={`translate(${head.cx + head.r + 4} ${head.cy - 10})`} className="mm-fx-puff">
          <path d="M0 6 a4 4 0 0 1 3 -7 a5 5 0 0 1 9 -1 a4.5 4.5 0 0 1 4 8 Z" fill="#9aa396" opacity="0.9" />
        </g>
      );
    case "play":
      return (
        <g>
          <Sparkle x={head.cx - 20} y={top} size={1} color="#7DA7D9" />
          <Sparkle x={head.cx + 20} y={top - 4} size={1.2} color="#F0D68F" delay={0.2} />
        </g>
      );
  }
}
