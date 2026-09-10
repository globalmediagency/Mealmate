import type { CreatureState } from "@/lib/game/creature-view";
import type { MouthType, SpeciesPalette } from "@/lib/creatures/types";
import type { Layout } from "../layout";
import { shade } from "../layout";

type MouthProps = { type: MouthType; layout: Layout; palette: SpeciesPalette; state: CreatureState };

export function Mouth({ type, layout, palette, state }: MouthProps) {
  const stroke = { stroke: palette.eye, strokeWidth: 1.4, strokeLinecap: "round" as const, fill: "none" };
  let content: React.ReactNode;

  if (state === "sick") {
    content = <path d="M-4.5 1 Q-2.2 -1.6 0 1 Q2.2 3.4 4.5 1" {...stroke} />;
  } else if (state === "tired") {
    content = <path d="M-3.2 0.5 L3.2 0.5" {...stroke} />;
  } else if (state === "dead") {
    content = <path d="M-2.5 0.5 Q0 2 2.5 0.5" {...stroke} opacity="0.7" />;
  } else {
    switch (type) {
      case "smile":
        content = <path d="M-4.2 -0.5 Q0 3.6 4.2 -0.5" {...stroke} />;
        break;
      case "small":
        content = <path d="M-1.8 0 Q0 1.8 1.8 0" {...stroke} />;
        break;
      case "tongue":
        content = (
          <g>
            <path d="M-4.5 -0.8 Q0 4 4.5 -0.8" {...stroke} />
            <ellipse cx="0.6" cy="2.4" rx="2.1" ry="1.9" fill="#E88A9A" />
          </g>
        );
        break;
      case "fangs":
        content = (
          <g>
            <path d="M-4.2 -0.5 Q0 3.6 4.2 -0.5" {...stroke} />
            <path d="M-2.6 0.4 L-2 2.6 L-1.4 0.6 Z" fill="#fff" />
            <path d="M1.4 0.6 L2 2.6 L2.6 0.4 Z" fill="#fff" />
          </g>
        );
        break;
      case "w":
        content = <path d="M-4.5 0 Q-2.2 2.5 0 0 Q2.2 2.5 4.5 0" {...stroke} />;
        break;
      case "beak":
        content = (
          <g>
            <path d="M-6.5 -1.2 Q0 -4.8 6.5 -1.2 Q0 5.2 -6.5 -1.2 Z" fill={palette.accent} />
            <path d="M-5 -0.6 Q0 1.2 5 -0.6" stroke={shade(palette.accent, -0.35)} strokeWidth="0.8" fill="none" />
          </g>
        );
        break;
      case "snout":
        content = (
          <g>
            <ellipse rx="5.6" ry="3.9" fill={palette.secondary} />
            <circle cx="-1.9" cy="0.1" r="0.9" fill={palette.eye} opacity="0.55" />
            <circle cx="1.9" cy="0.1" r="0.9" fill={palette.eye} opacity="0.55" />
          </g>
        );
        break;
    }
  }

  return <g transform={`translate(50 ${layout.mouthY})`}>{content}</g>;
}
