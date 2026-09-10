import type { CreatureState } from "@/lib/game/creature-view";
import type { EyeType, SpeciesPalette } from "@/lib/creatures/types";
import type { Layout } from "../layout";

type EyesProps = {
  type: EyeType;
  layout: Layout;
  palette: SpeciesPalette;
  state: CreatureState;
  uid: string;
  /** Skin colour under the eyelids. */
  lidColor: string;
};

const STAR = "M0 -3.2 L0.8 -0.8 L3.2 0 L0.8 0.8 L0 3.2 L-0.8 0.8 L-3.2 0 L-0.8 -0.8 Z";

function EyeShape({ type, palette }: { type: EyeType; palette: SpeciesPalette }) {
  switch (type) {
    case "big":
      return (
        <g>
          <ellipse rx="4.4" ry="5" fill="#fff" />
          <circle cx="0.4" cy="0.7" r="2.9" fill={palette.eye} />
          <circle cx="-1.1" cy="-1.4" r="1.2" fill="#fff" />
          <circle cx="1.4" cy="1.7" r="0.6" fill="#fff" opacity="0.8" />
        </g>
      );
    case "sparkle":
      return (
        <g>
          <ellipse rx="4.6" ry="5.2" fill="#fff" />
          <circle cx="0.3" cy="0.7" r="3.1" fill={palette.eye} />
          <path d={STAR} transform="translate(-1 -1.2) scale(0.55)" fill="#fff" />
          <circle cx="1.6" cy="1.9" r="0.7" fill="#fff" opacity="0.85" />
        </g>
      );
    case "sleepy":
      return (
        <g>
          <ellipse rx="4.3" ry="3.8" fill="#fff" />
          <circle cx="0.3" cy="0.9" r="2.5" fill={palette.eye} />
          <circle cx="-0.8" cy="-0.2" r="0.9" fill="#fff" />
        </g>
      );
    case "sharp":
      return (
        <g>
          <path d="M-4.8 0.4 C-3 -4.6 3 -4.6 4.8 0.4 C3 3.9 -3 3.9 -4.8 0.4 Z" fill="#fff" />
          <circle cx="0.6" cy="0.5" r="2.4" fill={palette.eye} />
          <circle cx="-0.6" cy="-0.8" r="0.9" fill="#fff" />
        </g>
      );
  }
}

function eyeClipPath(type: EyeType): string {
  switch (type) {
    case "sleepy":
      return "M-4.3 0 A4.3 3.8 0 1 1 4.3 0 A4.3 3.8 0 1 1 -4.3 0 Z";
    case "sharp":
      return "M-4.8 0.4 C-3 -4.6 3 -4.6 4.8 0.4 C3 3.9 -3 3.9 -4.8 0.4 Z";
    case "sparkle":
      return "M-4.6 0 A4.6 5.2 0 1 1 4.6 0 A4.6 5.2 0 1 1 -4.6 0 Z";
    default:
      return "M-4.4 0 A4.4 5 0 1 1 4.4 0 A4.4 5 0 1 1 -4.4 0 Z";
  }
}

function Eye({
  type,
  palette,
  state,
  side,
  uid,
  lidColor,
}: {
  type: EyeType;
  palette: SpeciesPalette;
  state: CreatureState;
  side: "l" | "r";
  uid: string;
  lidColor: string;
}) {
  const clipId = `${uid}-eye-${side}`;
  if (state === "dead") {
    return (
      <path
        d="M-4 0.5 Q0 -3.5 4 0.5"
        stroke={palette.eye}
        strokeWidth="1.4"
        strokeLinecap="round"
        fill="none"
        opacity="0.8"
      />
    );
  }
  const sleepyStatic = type === "sleepy";
  const droop = state === "sick" ? (side === "l" ? -10 : 10) : 0;
  return (
    <g>
      <clipPath id={clipId}>
        <path d={eyeClipPath(type)} />
      </clipPath>
      <EyeShape type={type} palette={palette} />
      <g clipPath={`url(#${clipId})`}>
        <g transform={`rotate(${droop})`}>
          <rect
            x="-6"
            y="-6"
            width="12"
            height="12"
            fill={lidColor}
            className={sleepyStatic ? "mm-lid mm-lid-static" : "mm-lid"}
          />
        </g>
      </g>
      {state === "healthy" || state === "tired" ? null : null}
      {sleepyStatic ? (
        <path d="M-4.2 -1.4 A4.4 3.9 0 0 1 4.2 -1.4" stroke={palette.eye} strokeWidth="1" fill="none" opacity="0.6" />
      ) : null}
    </g>
  );
}

export function Eyes({ type, layout, palette, state, uid, lidColor }: EyesProps) {
  const { eyeY, eyeGap, eyeScale } = layout;
  return (
    <g>
      <g transform={`translate(${50 - eyeGap} ${eyeY}) scale(${eyeScale})`}>
        <Eye type={type} palette={palette} state={state} side="l" uid={uid} lidColor={lidColor} />
      </g>
      <g transform={`translate(${50 + eyeGap} ${eyeY}) scale(${eyeScale})`}>
        <Eye type={type} palette={palette} state={state} side="r" uid={uid} lidColor={lidColor} />
      </g>
    </g>
  );
}
