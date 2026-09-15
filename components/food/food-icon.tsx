import type { FoodKind } from "@/lib/meals/food-icons";
import { FOOD_KIND_LABELS } from "@/lib/meals/food-icons";

type FoodIconProps = { kind: FoodKind; size?: number; className?: string };

const OUTLINE = "#2a2f2a";

/** Flat, chunky drawings of a food kind (viewBox 48×48), used by the feeding animation. */
export function FoodIcon({ kind, size = 56, className }: FoodIconProps) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} role="img" aria-label={FOOD_KIND_LABELS[kind]} className={className}>
      <g stroke={OUTLINE} strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round">
        {DRAWINGS[kind]}
      </g>
    </svg>
  );
}

const DRAWINGS: Record<FoodKind, React.ReactNode> = {
  salad: (
    <>
      <path d="M6 26 h36 l-4 12 a4 4 0 0 1 -4 3 H14 a4 4 0 0 1 -4 -3 Z" fill="#e8dcc0" />
      <path d="M9 26 c2 -9 8 -12 14 -10 c4 -4 12 -3 14 3 c4 0 6 4 5 7 Z" fill="#7FB77E" />
      <circle cx="17" cy="21" r="3" fill="#d9503f" />
      <circle cx="30" cy="19" r="3" fill="#d9503f" />
      <path d="M22 24 c2 -5 6 -6 8 -3" fill="none" stroke="#3f6b3d" />
    </>
  ),
  vegetables: (
    <>
      <path d="M10 40 c-4 -8 0 -22 10 -26 l6 26 Z" fill="#E39B4A" />
      <path d="M20 14 c-1 -5 2 -8 5 -8 c0 4 -2 6 -5 8 Z" fill="#7FB77E" />
      <circle cx="33" cy="20" r="8" fill="#7FB77E" />
      <path d="M29 18 a4 4 0 0 1 8 0" fill="none" stroke="#3f6b3d" />
      <rect x="31" y="27" width="4" height="12" rx="2" fill="#a6c97a" />
    </>
  ),
  apple: (
    <>
      <path d="M24 14 c-6 -6 -18 -2 -16 12 c1 8 6 16 12 16 c2 0 3 -1 4 -1 c1 0 2 1 4 1 c6 0 11 -8 12 -16 c2 -14 -10 -18 -16 -12 Z" fill="#d9503f" />
      <path d="M24 14 c0 -4 2 -7 5 -8" fill="none" />
      <path d="M25 11 c3 -4 8 -3 9 -1 c-3 2 -7 3 -9 1 Z" fill="#7FB77E" />
    </>
  ),
  banana: (
    <>
      <path d="M10 14 c2 12 10 22 24 24 c4 1 8 -1 8 -4 c-14 0 -22 -8 -26 -22 c-1 -3 -6 -2 -6 2 Z" fill="#E8C36A" />
      <path d="M12 12 l-2 -3" />
    </>
  ),
  fruit: (
    <>
      <circle cx="18" cy="28" r="10" fill="#E39B4A" />
      <circle cx="18" cy="28" r="6" fill="none" stroke="#f3c48a" strokeDasharray="2 3" />
      <path d="M26 20 c4 -10 16 -10 16 2 c0 8 -6 14 -10 14 c-4 0 -8 -6 -6 -16 Z" fill="#8f5c9c" />
      <path d="M33 18 c0 -4 2 -6 4 -7" fill="none" />
    </>
  ),
  bread: (
    <>
      <path d="M8 30 c0 -12 32 -12 32 0 v8 a3 3 0 0 1 -3 3 H11 a3 3 0 0 1 -3 -3 Z" fill="#d9a55a" />
      <path d="M8 30 c0 -12 32 -12 32 0 c-8 -5 -24 -5 -32 0 Z" fill="#e8c38a" />
      <path d="M16 24 l4 -4 M23 23 l4 -4 M30 24 l4 -4" fill="none" stroke="#a6702e" />
    </>
  ),
  pasta: (
    <>
      <path d="M6 28 h36 l-4 10 a4 4 0 0 1 -4 3 H14 a4 4 0 0 1 -4 -3 Z" fill="#e8dcc0" />
      <path d="M10 28 c2 -6 6 -9 10 -8 c2 -4 8 -5 12 -2 c3 -3 8 -1 8 4 c2 1 3 3 3 6 Z" fill="#E8C36A" />
      <path d="M14 24 c4 -2 8 -1 10 2 M24 20 c4 -1 7 1 9 4 M17 27 c5 -4 12 -4 18 -1" fill="none" stroke="#c8961f" />
      <circle cx="24" cy="21" r="3" fill="#d9503f" stroke="none" />
    </>
  ),
  rice: (
    <>
      <path d="M8 26 h32 c0 8 -6 16 -16 16 S8 34 8 26 Z" fill="#7a9fb8" />
      <path d="M10 26 c2 -8 8 -10 14 -8 c6 -2 12 0 14 8 Z" fill="#f7f4ec" />
      <path d="M16 22 h3 M22 19 h3 M28 22 h3 M20 24 h3 M26 25 h3" stroke="#c9c2ae" />
    </>
  ),
  pizza: (
    <>
      <path d="M8 12 l32 0 l-16 30 Z" fill="#E8C36A" />
      <path d="M8 12 h32" stroke="#d9a55a" strokeWidth="4" />
      <circle cx="18" cy="18" r="3" fill="#d9503f" />
      <circle cx="30" cy="19" r="3" fill="#d9503f" />
      <circle cx="24" cy="28" r="3" fill="#d9503f" />
      <path d="M22 16 l2 3 M27 26 l2 -3" stroke="#7FB77E" />
    </>
  ),
  burger: (
    <>
      <path d="M8 18 c0 -10 32 -10 32 0 Z" fill="#d9a55a" />
      <rect x="6" y="19" width="36" height="4" rx="2" fill="#7FB77E" />
      <rect x="7" y="23" width="34" height="5" rx="1.5" fill="#7a4a2a" />
      <path d="M6 28 h36 l-3 3 H9 Z" fill="#E8C36A" />
      <path d="M8 31 h32 v4 a4 4 0 0 1 -4 4 H12 a4 4 0 0 1 -4 -4 Z" fill="#d9a55a" />
      <path d="M16 12 h1 M24 11 h1 M32 12 h1" stroke="#f7f4ec" />
    </>
  ),
  fries: (
    <>
      <path d="M16 8 l3 16 M22 6 l1 18 M28 7 l-1 17 M33 10 l-3 14" stroke="#E8C36A" strokeWidth="5" />
      <path d="M16 8 l3 16 M22 6 l1 18 M28 7 l-1 17 M33 10 l-3 14" stroke={OUTLINE} strokeWidth="1" fill="none" />
      <path d="M10 22 h28 l-3 18 a3 3 0 0 1 -3 2 H16 a3 3 0 0 1 -3 -2 Z" fill="#d9503f" />
      <path d="M13 28 h22" stroke="#f7f4ec" strokeWidth="2.5" />
    </>
  ),
  sandwich: (
    <>
      <path d="M6 24 l18 -14 l18 14 Z" fill="#e8c38a" />
      <path d="M6 24 h36 l-2 4 H8 Z" fill="#7FB77E" />
      <path d="M8 28 h32 l-2 4 H10 Z" fill="#E8C36A" />
      <path d="M10 32 h28 l-2 6 a2 2 0 0 1 -2 2 H14 a2 2 0 0 1 -2 -2 Z" fill="#d9a55a" />
    </>
  ),
  meat: (
    <>
      <path d="M12 16 c-6 6 -6 18 4 22 c8 3 18 0 22 -6 c4 -6 0 -14 -6 -16 c-6 -2 -16 -4 -20 0 Z" fill="#c2604a" />
      <path d="M22 22 c4 -2 8 0 10 4 c-4 2 -8 0 -10 -4 Z" fill="#f2c5b2" />
      <circle cx="38" cy="14" r="4" fill="#f7f4ec" />
    </>
  ),
  chicken: (
    <>
      <path d="M14 30 c-4 -12 8 -22 18 -16 c6 4 6 14 0 18 c-4 3 -10 3 -14 0 Z" fill="#d9a55a" />
      <path d="M14 30 l-6 6 M10 33 l4 4" stroke="#f7f4ec" strokeWidth="3" />
      <path d="M22 18 c2 -1 4 -1 6 0" fill="none" stroke="#a6702e" />
    </>
  ),
  fish: (
    <>
      <path d="M8 24 c8 -10 20 -12 30 -2 c-10 10 -22 10 -30 2 Z" fill="#E39B4A" />
      <path d="M36 22 l6 -6 v14 Z" fill="#E39B4A" />
      <circle cx="16" cy="23" r="1.6" fill={OUTLINE} stroke="none" />
      <path d="M22 20 c2 2 2 5 0 7 M27 19 c2 2 2 6 0 8" fill="none" stroke="#f3c48a" />
    </>
  ),
  egg: (
    <>
      <ellipse cx="24" cy="26" rx="17" ry="12" fill="#f7f4ec" />
      <circle cx="24" cy="25" r="6" fill="#E8C36A" />
      <path d="M21 23 a2 2 0 0 1 3 -1" fill="none" stroke="#fff3c4" />
    </>
  ),
  soup: (
    <>
      <path d="M6 22 h36 c0 10 -8 18 -18 18 S6 32 6 22 Z" fill="#c9502e" />
      <path d="M6 22 h36" stroke="#e8dcc0" strokeWidth="3" />
      <path d="M14 16 c0 -3 3 -3 3 -6 M23 15 c0 -3 3 -3 3 -6 M32 16 c0 -3 3 -3 3 -6" fill="none" stroke="#c9c2ae" />
      <path d="M40 24 l6 -4" stroke="#c9c2ae" strokeWidth="2.5" />
    </>
  ),
  cheese: (
    <>
      <path d="M6 30 l30 -14 l6 8 v14 H10 a4 4 0 0 1 -4 -4 Z" fill="#E8C36A" />
      <path d="M6 30 l30 -14 l6 8 l-32 12 Z" fill="#f2d98a" />
      <circle cx="20" cy="33" r="2.5" fill="#d9a55a" />
      <circle cx="30" cy="31" r="2" fill="#d9a55a" />
      <circle cx="36" cy="36" r="1.5" fill="#d9a55a" />
    </>
  ),
  yogurt: (
    <>
      <path d="M12 14 h24 l-3 24 a3 3 0 0 1 -3 2 H18 a3 3 0 0 1 -3 -2 Z" fill="#f7f4ec" />
      <path d="M10 14 h28 v3 H10 Z" fill="#7a9fb8" />
      <path d="M17 22 c2 -3 4 -3 6 0 c2 3 4 3 6 0" fill="none" stroke="#e38ea5" />
      <path d="M36 8 l4 8" stroke="#c9c2ae" strokeWidth="2.5" />
    </>
  ),
  cereal: (
    <>
      <path d="M8 24 h32 c0 10 -7 16 -16 16 S8 34 8 24 Z" fill="#7a9fb8" />
      <path d="M8 24 h32" stroke="#f7f4ec" strokeWidth="3" />
      <circle cx="16" cy="19" r="3" fill="#d9a55a" />
      <circle cx="24" cy="17" r="3" fill="#d9a55a" />
      <circle cx="32" cy="19" r="3" fill="#d9a55a" />
      <circle cx="20" cy="22" r="2" fill="#e38ea5" />
    </>
  ),
  cake: (
    <>
      <path d="M8 26 h32 v10 a4 4 0 0 1 -4 4 H12 a4 4 0 0 1 -4 -4 Z" fill="#e38ea5" />
      <path d="M8 26 h32 v-6 c0 -3 -32 -3 -32 0 Z" fill="#f7f4ec" />
      <path d="M10 22 c3 4 6 -2 9 2 c3 4 6 -2 9 2 c3 4 6 -2 9 2" fill="none" stroke="#e38ea5" />
      <rect x="22" y="8" width="4" height="10" fill="#7FB77E" />
      <path d="M24 8 c-2 -3 2 -3 0 -6" fill="#E8C36A" />
    </>
  ),
  cookie: (
    <>
      <circle cx="24" cy="24" r="16" fill="#d9a55a" />
      <circle cx="18" cy="19" r="2.5" fill="#5a3b26" />
      <circle cx="29" cy="17" r="2" fill="#5a3b26" />
      <circle cx="30" cy="28" r="2.5" fill="#5a3b26" />
      <circle cx="19" cy="30" r="2" fill="#5a3b26" />
      <circle cx="24" cy="24" r="1.5" fill="#5a3b26" />
    </>
  ),
  chocolate: (
    <>
      <rect x="10" y="10" width="28" height="28" rx="3" fill="#5a3b26" />
      <path d="M10 24 h28 M24 10 v28" stroke="#3b2417" />
      <rect x="13" y="13" width="8" height="8" rx="1" fill="#7a4a2a" stroke="none" />
      <rect x="27" y="13" width="8" height="8" rx="1" fill="#7a4a2a" stroke="none" />
      <rect x="13" y="27" width="8" height="8" rx="1" fill="#7a4a2a" stroke="none" />
      <rect x="27" y="27" width="8" height="8" rx="1" fill="#7a4a2a" stroke="none" />
    </>
  ),
  candy: (
    <>
      <path d="M6 18 l8 6 l-8 6 Z M42 18 l-8 6 l8 6 Z" fill="#e38ea5" />
      <ellipse cx="24" cy="24" rx="11" ry="9" fill="#f0b8c8" />
      <path d="M18 17 c-2 5 -2 9 0 14 M24 15 c-2 6 -2 12 0 18 M30 17 c-2 5 -2 9 0 14" fill="none" stroke="#e38ea5" />
    </>
  ),
  icecream: (
    <>
      <path d="M14 24 h20 l-10 20 Z" fill="#d9a55a" />
      <path d="M16 28 l16 0 M18 32 l12 0 M20 36 l8 0" stroke="#a6702e" fill="none" />
      <circle cx="24" cy="16" r="10" fill="#f0b8c8" />
      <circle cx="30" cy="10" r="2" fill="#d9503f" />
    </>
  ),
  soda: (
    <>
      <path d="M14 10 h20 l-2 28 a3 3 0 0 1 -3 2 H19 a3 3 0 0 1 -3 -2 Z" fill="#c9502e" />
      <path d="M14 10 h20 v4 H14 Z" fill="#9aa396" />
      <circle cx="24" cy="26" r="6" fill="none" stroke="#f7f4ec" />
      <path d="M30 6 l-2 6" stroke="#f7f4ec" strokeWidth="2.5" />
    </>
  ),
  coffee: (
    <>
      <path d="M8 18 h26 v10 c0 8 -6 12 -13 12 S8 36 8 28 Z" fill="#f7f4ec" />
      <path d="M34 22 c6 0 6 10 0 10" fill="none" />
      <path d="M8 18 h26 v3 H8 Z" fill="#5a3b26" />
      <path d="M16 12 c0 -3 3 -3 3 -6 M24 12 c0 -3 3 -3 3 -6" fill="none" stroke="#c9c2ae" />
    </>
  ),
  plate: (
    <>
      <ellipse cx="24" cy="26" rx="20" ry="12" fill="#e8dcc0" />
      <ellipse cx="24" cy="26" rx="13" ry="7" fill="#f7f4ec" />
      <path d="M18 24 c2 -3 4 -3 6 0 c2 3 4 3 6 0" fill="none" stroke="#7FB77E" />
    </>
  ),
};
