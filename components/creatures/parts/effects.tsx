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

/** One-shot reactions; the last four are how the creature takes a throw (`tossLanding`, spec § 3.26). */
export type Reaction = "eat" | "play" | "heal" | "disgust" | "tap" | "sniff" | "dizzy" | "angry" | "tongue" | "laugh";

/** A small spiral (dizzy eyes). */
const SPIRAL = "M0 0 c0.9 -0.2 1.6 0.6 1.3 1.4 c-0.4 1 -1.9 1.1 -2.6 0.3 c-0.9 -1 -0.3 -2.8 1.1 -3.2 c1.8 -0.5 3.6 0.9 3.6 2.8";

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
    case "sniff":
      return null;
    case "dizzy":
      return (
        <g>
          {/* Three little stars circling above the head, and spirals in the eyes. */}
          <g transform={`translate(${head.cx} ${top - 4})`}>
            <g className="mm-orbit">
              {[0, 120, 240].map((deg) => (
                <g key={deg} transform={`rotate(${deg}) translate(14 0)`}>
                  <path d="M0 -3.2 l0.9 2.1 2.3 0.3 -1.7 1.5 0.5 2.3 -2 -1.2 -2 1.2 0.5 -2.3 -1.7 -1.5 2.3 -0.3z" fill="#F0D68F" />
                </g>
              ))}
            </g>
          </g>
          {/* Cream spirals with a dark edge: readable on the dark pupils as well as on the whites. */}
          {[layout.faceX - layout.eyeGap, layout.faceX + layout.eyeGap].map((x) => (
            <g key={x} transform={`translate(${x} ${layout.eyeY}) scale(${1.5 * layout.eyeScale})`} fill="none" strokeLinecap="round">
              <path d={SPIRAL} stroke="#2f2320" strokeWidth="1.6" opacity="0.7" />
              <path d={SPIRAL} stroke="#f7f4ec" strokeWidth="0.8" />
            </g>
          ))}
        </g>
      );
    case "angry":
      return (
        <g>
          {/* Furrowed brows, a cross-popping-veins mark at the temple, steam off the head. */}
          <g stroke="#2f2320" strokeWidth="1.6" strokeLinecap="round" fill="none">
            <path d={`M${layout.faceX - layout.eyeGap - 4} ${layout.eyeY - 7} l7 3`} />
            <path d={`M${layout.faceX + layout.eyeGap + 4} ${layout.eyeY - 7} l-7 3`} />
          </g>
          <g transform={`translate(${head.cx + head.r * 0.78} ${top + 6})`} stroke="#d9666b" strokeWidth="1.4" strokeLinecap="round" fill="none" className="mm-pulse-soft">
            <path d="M-4 -1 a4 4 0 0 1 4 -4 M0 -1 a4 4 0 0 1 4 4 M-1 5 a4 4 0 0 1 -4 -4 M1 5 a4 4 0 0 1 4 -4" />
          </g>
          <g fill="#d9666b" opacity="0.75">
            {[-10, 2, 12].map((dx, i) => (
              <circle key={dx} cx={head.cx + dx} cy={top - 3} r={2.2 - i * 0.3} className="mm-fx-rise" style={{ animationDelay: `${i * 0.15}s` }} />
            ))}
          </g>
        </g>
      );
    case "tongue":
      return (
        <g>
          {/* Tongue out below the mouth, one eye winking. */}
          {/* The wagging animation sets `transform` in CSS, which would replace the attribute: the placement lives on a parent group. */}
          <g transform={`translate(${layout.faceX} ${layout.mouthY + 1})`}>
            <g className="mm-taunt-tongue">
              <path d="M-3.6 0 h7.2 v5 a3.6 3.6 0 0 1 -7.2 0 z" fill="#e58fa8" stroke="#b5737b" strokeWidth="0.7" />
              <path d="M0 1.4 v5.4" stroke="#b5737b" strokeWidth="0.6" strokeLinecap="round" />
            </g>
          </g>
          <path d={`M${layout.faceX + layout.eyeGap - 3.5} ${layout.eyeY} q3.5 2.4 7 0`} fill="none" stroke="#2f2320" strokeWidth="1.3" strokeLinecap="round" />
        </g>
      );
    case "laugh":
      return (
        <g>
          {/* Hearts rising and a few sparkles (the eyes stay as drawn: glasses may cover them). */}
          {[-14, 14].map((dx, i) => (
            <path key={dx} d={HEART} fill="#E38EA5" transform={`translate(${head.cx + dx} ${top + 2}) scale(1.1)`} className="mm-fx-rise" style={{ animationDelay: `${i * 0.2}s` }} />
          ))}
          <Sparkle x={head.cx - 22} y={top + 2} size={1.1} color="#F0D68F" />
          <Sparkle x={head.cx + 22} y={top - 2} size={1.2} color="#E38EA5" delay={0.25} />
          <Sparkle x={head.cx} y={top - 10} size={0.9} color="#7DA7D9" delay={0.5} />
        </g>
      );
  }
}
