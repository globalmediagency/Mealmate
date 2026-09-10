import type { CSSProperties } from "react";
import type { Tier } from "@/lib/game/config";
import { cn } from "@/lib/utils/cn";

type EggProps = {
  tier: Tier;
  /** 0 intact … 3 heavily cracked, 4 ready to hatch. */
  crack?: 0 | 1 | 2 | 3 | 4;
  size?: number | string;
  animated?: boolean;
  /** "shake" while hatching, "burst" when opening. */
  phase?: "idle" | "shake" | "burst";
  className?: string;
  style?: CSSProperties;
};

const EGG_PATH = "M50 6 C29 6 14 36 14 64 C14 86 30 96 50 96 C70 96 86 86 86 64 C86 36 71 6 50 6 Z";

const THEMES: Record<Tier, { light: string; mid: string; dark: string; accent: string; pattern: "dots" | "leaves" | "runes" }> = {
  facile: { light: "#d8e2cc", mid: "#8ba07a", dark: "#3f4c38", accent: "#e8c36a", pattern: "dots" },
  moyen: { light: "#d9c7a8", mid: "#8b7a55", dark: "#3d3222", accent: "#7fb77e", pattern: "leaves" },
  difficile: { light: "#b8a9e0", mid: "#5f4b9c", dark: "#241a4a", accent: "#f0d68f", pattern: "runes" },
};

function Pattern({ pattern, accent }: { pattern: "dots" | "leaves" | "runes"; accent: string }) {
  switch (pattern) {
    case "dots":
      return (
        <g fill={accent} opacity="0.85">
          <circle cx="36" cy="46" r="3" />
          <circle cx="63" cy="38" r="2.4" />
          <circle cx="59" cy="62" r="3.4" />
          <circle cx="40" cy="72" r="2.2" />
          <circle cx="50" cy="26" r="1.8" />
        </g>
      );
    case "leaves":
      return (
        <g fill={accent} opacity="0.8">
          <path d="M34 48 c-2 -8 4 -14 10 -13 c1 8 -4 14 -10 13z" />
          <path d="M62 40 c-2 -7 3 -12 8 -11 c1 7 -3 12 -8 11z" />
          <path d="M58 70 c-2 -8 4 -14 10 -13 c1 8 -4 14 -10 13z" transform="rotate(30 63 63)" />
          <path d="M40 78 c-2 -6 3 -10 7 -9 c1 6 -3 10 -7 9z" />
        </g>
      );
    case "runes":
      return (
        <g stroke={accent} strokeWidth="1.8" strokeLinecap="round" fill="none" opacity="0.9">
          <path d="M36 44 l0 10 M32 49 l8 0" />
          <path d="M62 36 l5 8 M67 36 l-5 8" />
          <path d="M58 66 l0 12 M54 70 l8 4" />
          <path d="M42 74 l6 0 l-3 -6 z" />
          <circle cx="50" cy="26" r="2" />
        </g>
      );
  }
}

/** Tier-specific egg with progressive cracks (25 / 50 / 75 / 100 %). */
export function Egg({ tier, crack = 0, size = 200, animated = true, phase = "idle", className, style }: EggProps) {
  const theme = THEMES[tier];
  const gradientId = `egg-${tier}`;
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      role="img"
      aria-label={`Œuf ${tier}`}
      className={cn("mm-egg", animated && "mm-anim", phase === "shake" && "mm-egg-shake", phase === "burst" && "mm-egg-burst", className)}
      style={style}
    >
      <defs>
        <linearGradient id={`${gradientId}-shell`} x1="0.2" y1="0" x2="0.9" y2="1">
          <stop offset="0" stopColor={theme.light} />
          <stop offset="0.55" stopColor={theme.mid} />
          <stop offset="1" stopColor={theme.dark} />
        </linearGradient>
        <radialGradient id={`${gradientId}-shine`} cx="0.35" cy="0.25" r="0.5">
          <stop offset="0" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${gradientId}-glow`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor={theme.accent} stopOpacity="0.55" />
          <stop offset="1" stopColor={theme.accent} stopOpacity="0" />
        </radialGradient>
      </defs>
      {crack >= 4 ? <circle cx="50" cy="54" r="48" fill={`url(#${gradientId}-glow)`} className="mm-pulse-soft" /> : null}
      <ellipse cx="50" cy="96" rx="26" ry="4" fill="#000" opacity="0.3" />
      <g className="mm-egg-body">
        <path d={EGG_PATH} fill={`url(#${gradientId}-shell)`} />
        <Pattern pattern={theme.pattern} accent={theme.accent} />
        <path d={EGG_PATH} fill={`url(#${gradientId}-shine)`} />
        <path d="M32 36 c5 -12 12 -20 20 -25" stroke="#fff" strokeOpacity="0.45" strokeWidth="3" strokeLinecap="round" fill="none" />
        <g stroke={theme.dark} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none">
          {crack >= 1 ? <path d="M64 22 l-4 7 l5 5 l-3 6" /> : null}
          {crack >= 2 ? <path d="M30 52 l6 4 l-3 7 l7 4" /> : null}
          {crack >= 3 ? <path d="M22 66 l8 -3 l6 6 l8 -4 l7 5 l8 -6 l10 3" /> : null}
          {crack >= 4 ? (
            <g stroke={theme.accent} strokeWidth="1.2" opacity="0.9" className="mm-pulse-soft">
              <path d="M22 66 l8 -3 l6 6 l8 -4 l7 5 l8 -6 l10 3" />
              <path d="M64 22 l-4 7 l5 5 l-3 6" />
            </g>
          ) : null}
        </g>
      </g>
    </svg>
  );
}
