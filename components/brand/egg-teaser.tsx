import { cn } from "@/lib/utils/cn";

type EggTeaserProps = { className?: string; size?: number };

/** Gently wobbling egg used on the landing and on the phase-1 home screen. */
export function EggTeaser({ className, size = 200 }: EggTeaserProps) {
  return (
    <div
      className={cn("relative mx-auto flex items-center justify-center", className)}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <div className="absolute inset-4 rounded-full bg-sage-500/20 blur-2xl animate-pulse-soft" />
      <svg
        viewBox="0 0 200 240"
        width={size}
        height={size * 1.2}
        className="relative animate-wobble motion-reduce:animate-none"
        style={{ transformOrigin: "50% 90%" }}
      >
        <defs>
          <linearGradient id="mm-egg-shell" x1="0.2" y1="0" x2="0.9" y2="1">
            <stop offset="0" stopColor="#d8e2cc" />
            <stop offset="0.55" stopColor="#8ba07a" />
            <stop offset="1" stopColor="#3f4c38" />
          </linearGradient>
          <radialGradient id="mm-egg-shine" cx="0.35" cy="0.25" r="0.5">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0.55" />
            <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>
        </defs>
        <ellipse cx="100" cy="222" rx="58" ry="10" fill="#000" opacity="0.35" />
        <path
          d="M100 14c-42 0-72 58-72 118 0 46 32 76 72 76s72-30 72-76c0-60-30-118-72-118z"
          fill="url(#mm-egg-shell)"
        />
        <path
          d="M100 14c-42 0-72 58-72 118 0 46 32 76 72 76s72-30 72-76c0-60-30-118-72-118z"
          fill="url(#mm-egg-shine)"
        />
        <g fill="#e8c36a" opacity="0.85">
          <circle cx="72" cy="120" r="5" />
          <circle cx="126" cy="96" r="4" />
          <circle cx="118" cy="150" r="6" />
          <circle cx="86" cy="172" r="3.5" />
        </g>
        <path
          d="M52 70c10-22 24-38 40-46"
          stroke="#f2efe6"
          strokeOpacity="0.5"
          strokeWidth="5"
          strokeLinecap="round"
          fill="none"
        />
      </svg>
    </div>
  );
}
