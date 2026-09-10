import type { Tier } from "@/lib/game/config";
import { cn } from "@/lib/utils/cn";

type EnvironmentProps = { tier: Tier; className?: string };

/** Decorative background scene behind the creature (per tier). */
export function Environment({ tier, className }: EnvironmentProps) {
  return (
    <svg
      viewBox="0 0 400 300"
      preserveAspectRatio="xMidYMax slice"
      aria-hidden="true"
      className={cn("h-full w-full", className)}
    >
      <defs>
        <radialGradient id={`env-${tier}-sky`} cx="0.5" cy="0.15" r="0.8">
          <stop offset="0" stopColor={tier === "difficile" ? "#3a2f6b" : tier === "moyen" ? "#24331f" : "#2b3a2a"} />
          <stop offset="1" stopColor="#0b0d0b" />
        </radialGradient>
        <linearGradient id={`env-${tier}-hill1`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={tier === "difficile" ? "#5f4b9c" : tier === "moyen" ? "#3f5a38" : "#5e7053"} />
          <stop offset="1" stopColor={tier === "difficile" ? "#241a4a" : "#1a201a"} />
        </linearGradient>
        <linearGradient id={`env-${tier}-hill2`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={tier === "difficile" ? "#7c69b8" : tier === "moyen" ? "#5e7053" : "#8ba07a"} />
          <stop offset="1" stopColor={tier === "difficile" ? "#3a2f6b" : "#3f4c38"} />
        </linearGradient>
      </defs>
      <rect width="400" height="300" fill={`url(#env-${tier}-sky)`} />
      {/* Stars / fireflies */}
      <g fill="#F0D68F" opacity="0.7">
        <circle cx="60" cy="50" r="1.6" className="mm-twinkle" />
        <circle cx="330" cy="40" r="1.2" className="mm-twinkle" style={{ animationDelay: "0.8s" }} />
        <circle cx="250" cy="80" r="1" className="mm-twinkle" style={{ animationDelay: "1.4s" }} />
        <circle cx="120" cy="110" r="1.3" className="mm-twinkle" style={{ animationDelay: "0.4s" }} />
        {tier === "difficile" ? (
          <>
            <circle cx="200" cy="30" r="2" className="mm-twinkle" style={{ animationDelay: "1s" }} />
            <circle cx="360" cy="120" r="1.4" className="mm-twinkle" style={{ animationDelay: "0.2s" }} />
          </>
        ) : null}
      </g>
      {/* Moon glow */}
      <circle cx="320" cy="70" r="26" fill="#F7F4EC" opacity={tier === "difficile" ? 0.35 : 0.18} />
      <circle cx="320" cy="70" r="60" fill="#F7F4EC" opacity="0.05" />
      {tier === "moyen" ? (
        <g fill="#111611" opacity="0.9">
          <path d="M30 240 l18 -70 l18 70 z" />
          <path d="M70 240 l14 -55 l14 55 z" />
          <path d="M300 240 l20 -80 l20 80 z" />
          <path d="M345 240 l14 -50 l14 50 z" />
        </g>
      ) : null}
      <path d="M0 230 C80 190 160 210 240 200 C320 190 360 210 400 200 L400 300 L0 300 Z" fill={`url(#env-${tier}-hill1)`} />
      <path d="M0 262 C100 236 200 250 300 240 C340 236 380 244 400 250 L400 300 L0 300 Z" fill={`url(#env-${tier}-hill2)`} />
      {tier === "facile" ? (
        <g>
          <g fill="#E38EA5" opacity="0.8">
            <circle cx="70" cy="262" r="3" />
            <circle cx="340" cy="258" r="2.5" />
          </g>
          <g fill="#F0D68F" opacity="0.8">
            <circle cx="110" cy="272" r="2" />
            <circle cx="300" cy="270" r="2.2" />
          </g>
          <g stroke="#3f4c38" strokeWidth="2" strokeLinecap="round">
            <path d="M70 265 v10 M340 261 v9 M110 274 v7 M300 272 v8" />
          </g>
        </g>
      ) : null}
      {tier === "difficile" ? (
        <g opacity="0.85">
          <path d="M60 200 l30 -10 l30 10 l-30 8 z" fill="#7c69b8" className="mm-float" />
          <path d="M290 180 l24 -8 l24 8 l-24 6 z" fill="#7c69b8" className="mm-float" style={{ animationDelay: "1s" }} />
        </g>
      ) : null}
    </svg>
  );
}
