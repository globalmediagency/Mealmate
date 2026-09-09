import { cn } from "@/lib/utils/cn";

type LogoProps = { className?: string; withWordmark?: boolean };

/** MealMate mark: a sage egg with a brass spark, drawn in SVG. */
export function Logo({ className, withWordmark = false }: LogoProps) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <svg
        viewBox="0 0 64 64"
        width="36"
        height="36"
        role="img"
        aria-label="MealMate"
        className="shrink-0"
      >
        <defs>
          <linearGradient id="mm-logo-egg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#c3d2b3" />
            <stop offset="1" stopColor="#6f8461" />
          </linearGradient>
        </defs>
        <rect width="64" height="64" rx="18" fill="#121612" />
        <path
          d="M32 10c-9 0-17 12-17 25 0 10 7.5 17 17 17s17-7 17-17c0-13-8-25-17-25z"
          fill="url(#mm-logo-egg)"
        />
        <path
          d="M25 24c1.5-5 4-8.5 7-10"
          stroke="#f2efe6"
          strokeOpacity="0.55"
          strokeWidth="2.5"
          strokeLinecap="round"
          fill="none"
        />
        <path
          d="M46 14l1.6 3.6 3.6 1.6-3.6 1.6L46 24.4l-1.6-3.6-3.6-1.6 3.6-1.6z"
          fill="#e8c36a"
        />
      </svg>
      {withWordmark ? (
        <span className="font-display text-2xl font-semibold tracking-tight text-cream-50">
          MealMate
        </span>
      ) : null}
    </span>
  );
}
