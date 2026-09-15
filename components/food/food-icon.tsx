import type { FoodKind } from "@/lib/meals/food-icons";
import { FOOD_KIND_LABELS } from "@/lib/meals/food-icons";

type FoodIconProps = { kind: FoodKind; size?: number; className?: string };

const OUTLINE = "#2a2f2a";

/** Flat, chunky drawings of a food kind (viewBox 48×48), used by the feeding animation. */
export function FoodIcon({ kind, size = 56, className }: FoodIconProps) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} role="img" aria-label={FOOD_KIND_LABELS[kind]} className={className}>
      <g stroke={OUTLINE} strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round">
        {FOOD_DRAWINGS[kind]}
      </g>
    </svg>
  );
}

/** One drawing per kind: the test `lib/meals/food-icons.test.ts` checks the catalogue is complete. */
export const FOOD_DRAWINGS: Record<FoodKind, React.ReactNode> = {
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
  // --- Fruits ---
  pear: (
    <>
      <path d="M24 10 c-2 6 -10 8 -10 18 a10 10 0 0 0 20 0 c0 -10 -8 -12 -10 -18 Z" fill="#a6c97a" />
      <path d="M24 10 c1 -3 3 -5 5 -6" fill="none" />
      <circle cx="19" cy="30" r="1.2" fill="#7f9c5a" stroke="none" />
    </>
  ),
  orange: (
    <>
      <circle cx="24" cy="26" r="15" fill="#E39B4A" />
      <circle cx="24" cy="26" r="9" fill="none" stroke="#f3c48a" strokeDasharray="2 3" />
      <path d="M22 11 c3 -4 8 -4 10 -1 c-3 2 -7 3 -10 1 Z" fill="#7FB77E" />
    </>
  ),
  strawberry: (
    <>
      <path d="M24 14 c-10 0 -14 8 -10 16 c3 6 7 10 10 12 c3 -2 7 -6 10 -12 c4 -8 0 -16 -10 -16 Z" fill="#d9503f" />
      <path d="M16 12 c4 -2 12 -2 16 0 c-2 3 -4 5 -8 6 c-4 -1 -6 -3 -8 -6 Z" fill="#7FB77E" />
      <path d="M19 22 h1 M27 22 h1 M23 28 h1 M20 32 h1 M27 31 h1" stroke="#f7f4ec" />
    </>
  ),
  grapes: (
    <>
      <path d="M24 8 c0 -3 3 -5 6 -4" fill="none" />
      {[
        [16, 18],
        [24, 16],
        [32, 18],
        [20, 26],
        [28, 26],
        [16, 34],
        [24, 34],
        [32, 34],
        [24, 42],
      ].map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="5" fill="#8f5c9c" />
      ))}
    </>
  ),
  cherry: (
    <>
      <path d="M18 30 c0 -12 6 -18 14 -22 M32 30 c-2 -10 -4 -16 0 -22" fill="none" />
      <circle cx="18" cy="32" r="8" fill="#b83a2e" />
      <circle cx="32" cy="32" r="8" fill="#d9503f" />
      <path d="M30 8 c3 -3 8 -2 9 2 c-3 2 -7 2 -9 -2 Z" fill="#7FB77E" />
    </>
  ),
  peach: (
    <>
      <circle cx="24" cy="26" r="15" fill="#f0a070" />
      <path d="M24 12 c-4 6 -4 20 0 28" fill="none" stroke="#d9743f" />
      <path d="M24 12 c3 -4 8 -4 10 -1 c-3 2 -7 2 -10 1 Z" fill="#7FB77E" />
    </>
  ),
  watermelon: (
    <>
      <path d="M6 20 h36 a18 18 0 0 1 -36 0 Z" fill="#3f6b3d" />
      <path d="M9 20 h30 a15 15 0 0 1 -30 0 Z" fill="#d9503f" />
      <path d="M17 26 h1 M24 30 h1 M31 26 h1 M22 24 h1" stroke={OUTLINE} strokeWidth="2.5" />
    </>
  ),
  melon: (
    <>
      <path d="M6 22 h36 a18 18 0 0 1 -36 0 Z" fill="#a6c97a" />
      <path d="M9 22 h30 a15 15 0 0 1 -30 0 Z" fill="#f2c56a" />
      <path d="M14 22 c4 -3 16 -3 20 0" fill="none" stroke="#e8a94a" />
    </>
  ),
  lemon: (
    <>
      <path d="M8 24 c0 -10 32 -10 32 0 c0 10 -32 10 -32 0 Z" fill="#f2d24a" />
      <path d="M40 24 l4 -2 M8 24 l-4 2" />
      <path d="M18 20 c4 -2 8 -2 12 0" fill="none" stroke="#f7ea9a" />
    </>
  ),
  kiwi: (
    <>
      <circle cx="24" cy="24" r="16" fill="#8a6b3f" />
      <circle cx="24" cy="24" r="12" fill="#a6c97a" />
      <circle cx="24" cy="24" r="4" fill="#f2f0d8" />
      {[0, 60, 120, 180, 240, 300].map((a) => (
        <circle key={a} cx={24 + 8 * Math.cos((a * Math.PI) / 180)} cy={24 + 8 * Math.sin((a * Math.PI) / 180)} r="1" fill={OUTLINE} stroke="none" />
      ))}
    </>
  ),
  mango: (
    <>
      <path d="M10 22 c2 -12 18 -16 28 -8 c6 6 2 22 -10 24 c-10 2 -20 -6 -18 -16 Z" fill="#f2b84a" />
      <path d="M14 20 c6 -6 14 -8 20 -6" fill="none" stroke="#e39b4a" />
      <path d="M36 12 c2 -3 5 -4 7 -2" fill="none" stroke="#7FB77E" />
    </>
  ),
  pineapple: (
    <>
      <path d="M24 2 l4 8 l6 -4 l-3 7 l7 1 l-6 4 Z M24 2 l-4 8 l-6 -4 l3 7 l-7 1 l6 4 Z" fill="#7FB77E" />
      <ellipse cx="24" cy="30" rx="11" ry="14" fill="#E8C36A" />
      <path d="M15 24 l18 12 M15 36 l18 -12 M24 16 v28 M13 30 h22" stroke="#b8862e" fill="none" />
    </>
  ),
  avocado: (
    <>
      <path d="M24 6 c-6 0 -8 8 -10 14 c-4 10 0 22 10 22 s14 -12 10 -22 c-2 -6 -4 -14 -10 -14 Z" fill="#3f6b3d" />
      <path d="M24 10 c-4 0 -6 8 -8 12 c-3 8 0 18 8 18 s11 -10 8 -18 c-2 -4 -4 -12 -8 -12 Z" fill="#c3d982" />
      <circle cx="24" cy="30" r="6" fill="#8a6b3f" />
    </>
  ),
  berries: (
    <>
      <circle cx="16" cy="30" r="7" fill="#4a5a9c" />
      <circle cx="32" cy="30" r="7" fill="#4a5a9c" />
      <circle cx="24" cy="18" r="7" fill="#c2405a" />
      <path d="M22 12 l2 -4 l2 4" fill="none" stroke="#7FB77E" />
      <circle cx="16" cy="30" r="2" fill="none" stroke="#8fa0d9" />
      <circle cx="32" cy="30" r="2" fill="none" stroke="#8fa0d9" />
    </>
  ),
  nuts: (
    <>
      <ellipse cx="16" cy="28" rx="8" ry="6" fill="#c89a5a" />
      <path d="M12 28 c2 -3 6 -3 8 0" fill="none" stroke="#8a6b3f" />
      <path d="M30 14 c6 0 10 6 10 12 c0 6 -4 10 -8 10 c-6 0 -10 -6 -10 -12 c0 -6 4 -10 8 -10 Z" fill="#a6702e" />
      <path d="M30 14 c-2 4 -2 10 2 16" fill="none" stroke="#7a4a2a" />
    </>
  ),
  // --- Vegetables ---
  tomato: (
    <>
      <circle cx="24" cy="27" r="15" fill="#d9503f" />
      <path d="M24 12 l-6 -3 M24 12 l6 -3 M24 12 l-2 -6 M24 12 l2 -6" stroke="#3f6b3d" strokeWidth="2" />
      <path d="M17 20 c2 -3 5 -4 8 -4" fill="none" stroke="#f08a78" />
    </>
  ),
  carrot: (
    <>
      <path d="M12 40 c-2 -12 6 -26 16 -30 l8 8 c-4 10 -14 20 -24 22 Z" fill="#E39B4A" />
      <path d="M28 10 c-4 -4 -2 -8 2 -6 c2 -4 6 -4 6 0 c4 0 6 4 2 6 Z" fill="#7FB77E" />
      <path d="M18 30 l4 -1 M22 24 l4 -1" stroke="#c07a2a" />
    </>
  ),
  broccoli: (
    <>
      <rect x="21" y="26" width="6" height="14" rx="2" fill="#a6c97a" />
      <circle cx="14" cy="22" r="7" fill="#3f6b3d" />
      <circle cx="34" cy="22" r="7" fill="#3f6b3d" />
      <circle cx="24" cy="14" r="9" fill="#4f8a4c" />
      <circle cx="24" cy="24" r="6" fill="#4f8a4c" />
    </>
  ),
  potato: (
    <>
      <path d="M10 22 c0 -10 10 -14 18 -12 c8 2 12 10 10 18 c-2 8 -12 12 -20 8 c-6 -3 -8 -8 -8 -14 Z" fill="#c8a06a" />
      <circle cx="18" cy="20" r="1.3" fill="#8a6b3f" stroke="none" />
      <circle cx="30" cy="18" r="1.3" fill="#8a6b3f" stroke="none" />
      <circle cx="26" cy="30" r="1.3" fill="#8a6b3f" stroke="none" />
    </>
  ),
  corn: (
    <>
      <path d="M18 6 c-8 6 -10 24 -4 36 c4 4 10 -6 12 -14 c2 -10 -2 -20 -8 -22 Z" fill="#7FB77E" />
      <path d="M24 8 c6 4 8 16 6 26 c-1 6 -4 10 -8 10 c-4 -6 -6 -20 2 -36 Z" fill="#f2d24a" />
      <path d="M22 14 h4 M21 20 h6 M21 26 h6 M22 32 h5" stroke="#c8a12a" />
    </>
  ),
  pepper: (
    <>
      <path d="M12 18 c0 -6 4 -8 6 -6 c2 -2 6 -2 6 0 c2 -2 6 -2 6 0 c2 -2 6 0 6 6 v12 c0 8 -6 12 -12 12 s-12 -4 -12 -12 Z" fill="#d9503f" />
      <path d="M24 12 c0 -4 2 -6 5 -7" fill="none" stroke="#3f6b3d" strokeWidth="2" />
      <path d="M18 18 v16 M30 18 v16" fill="none" stroke="#b83a2e" />
    </>
  ),
  mushroom: (
    <>
      <path d="M8 22 c0 -12 32 -12 32 0 Z" fill="#c8a06a" />
      <path d="M18 22 h12 l2 16 a3 3 0 0 1 -3 3 h-10 a3 3 0 0 1 -3 -3 Z" fill="#f2f0d8" />
      <circle cx="16" cy="16" r="2" fill="#f2f0d8" stroke="none" />
      <circle cx="28" cy="14" r="2.5" fill="#f2f0d8" stroke="none" />
    </>
  ),
  onion: (
    <>
      <path d="M24 12 c-10 2 -16 10 -14 20 c2 8 8 10 14 10 s12 -2 14 -10 c2 -10 -4 -18 -14 -20 Z" fill="#e0b070" />
      <path d="M24 12 c-4 8 -6 18 -4 30 M24 12 c4 8 6 18 4 30" fill="none" stroke="#b8862e" />
      <path d="M22 12 c0 -4 1 -6 2 -8 c1 2 2 4 2 8" fill="#7FB77E" />
    </>
  ),
  cucumber: (
    <>
      <path d="M8 34 c4 -14 16 -26 30 -28 c4 0 4 4 2 8 c-6 12 -18 22 -30 24 c-3 0 -3 -2 -2 -4 Z" fill="#4f8a4c" />
      <path d="M14 30 c6 -8 14 -16 22 -20" fill="none" stroke="#a6c97a" />
    </>
  ),
  eggplant: (
    <>
      <path d="M12 30 c0 -12 10 -20 24 -22 c2 8 -2 24 -12 30 c-6 4 -12 0 -12 -8 Z" fill="#5b3a7a" />
      <path d="M36 8 c-4 -2 -8 0 -10 4 c4 0 8 -1 10 -4 Z" fill="#3f6b3d" />
      <path d="M18 26 c2 -6 6 -10 10 -12" fill="none" stroke="#8a66b0" />
    </>
  ),
  peas: (
    <>
      <path d="M6 30 c8 -14 26 -18 36 -10 c-8 12 -24 16 -36 10 Z" fill="#7FB77E" />
      <circle cx="16" cy="24" r="4" fill="#a6c97a" />
      <circle cx="26" cy="21" r="4" fill="#a6c97a" />
      <circle cx="35" cy="22" r="3.5" fill="#a6c97a" />
    </>
  ),
  beans: (
    <>
      <path d="M8 30 h32 c0 8 -7 12 -16 12 S8 38 8 30 Z" fill="#8a6b3f" />
      <path d="M8 30 h32" stroke="#e8dcc0" strokeWidth="3" />
      {[
        [14, 24],
        [22, 20],
        [30, 24],
        [26, 27],
        [18, 28],
      ].map(([x, y]) => (
        <ellipse key={`${x}-${y}`} cx={x} cy={y} rx="4" ry="2.6" fill="#c2604a" />
      ))}
    </>
  ),
  pumpkin: (
    <>
      <path d="M8 28 c0 -12 32 -12 32 0 c0 8 -8 12 -16 12 S8 36 8 28 Z" fill="#E39B4A" />
      <path d="M17 18 c-2 6 -2 16 0 21 M31 18 c2 6 2 16 0 21 M24 17 v23" fill="none" stroke="#c07a2a" />
      <path d="M22 16 c0 -4 1 -6 3 -8 c1 2 2 5 1 8" fill="#7FB77E" />
    </>
  ),
  olive: (
    <>
      <ellipse cx="18" cy="28" rx="7" ry="9" fill="#3f6b3d" />
      <ellipse cx="32" cy="26" rx="7" ry="9" fill="#5a4a2a" />
      <path d="M26 12 c-4 4 -4 10 -2 14 M26 12 c4 -2 8 0 10 4 c-4 1 -8 0 -10 -4 Z" fill="#7FB77E" />
      <circle cx="18" cy="28" r="1.5" fill="#d9503f" stroke="none" />
    </>
  ),
  chili: (
    <>
      <path d="M12 38 c-2 -12 6 -26 22 -30 c6 8 2 24 -12 30 c-4 2 -8 2 -10 0 Z" fill="#d9503f" />
      <path d="M34 8 c2 -4 6 -4 8 -2 c-3 1 -5 3 -8 2 Z" fill="#3f6b3d" />
      <path d="M18 32 c4 -8 10 -16 16 -20" fill="none" stroke="#f08a78" />
    </>
  ),
  garlic: (
    <>
      <path d="M24 14 c-10 0 -16 8 -14 18 c2 8 8 10 14 10 s12 -2 14 -10 c2 -10 -4 -18 -14 -18 Z" fill="#f2f0d8" />
      <path d="M24 14 c-4 8 -5 18 -3 28 M24 14 c4 8 5 18 3 28 M24 14 c0 8 0 18 0 28" fill="none" stroke="#c9c2ae" />
      <path d="M22 14 c0 -4 1 -8 2 -10 c1 2 2 6 2 10" fill="#c9c2ae" />
    </>
  ),
  // --- Bakery and grains ---
  croissant: (
    <>
      <path d="M6 30 c2 -10 10 -16 18 -16 s16 6 18 16 c-4 2 -6 -2 -8 -4 c-4 4 -16 4 -20 0 c-2 2 -4 6 -8 4 Z" fill="#d9a55a" />
      <path d="M14 26 c2 -6 6 -8 10 -8 s8 2 10 8" fill="none" stroke="#a6702e" />
      <path d="M6 30 c2 -2 4 -4 6 -2 M42 30 c-2 -2 -4 -4 -6 -2" fill="none" stroke="#a6702e" />
    </>
  ),
  toast: (
    <>
      <path d="M8 20 c0 -8 32 -8 32 0 v16 a4 4 0 0 1 -4 4 H12 a4 4 0 0 1 -4 -4 Z" fill="#d9a55a" />
      <path d="M12 22 c0 -5 24 -5 24 0 v12 H12 Z" fill="#e8c38a" />
      <path d="M16 26 l16 8 M16 34 l16 -8" stroke="#f2d24a" fill="none" />
    </>
  ),
  noodles: (
    <>
      <path d="M6 24 h36 c0 10 -8 16 -18 16 S6 34 6 24 Z" fill="#c9502e" />
      <path d="M6 24 h36" stroke="#e8dcc0" strokeWidth="3" />
      <path d="M12 22 c4 -8 8 -8 12 -2 c4 -6 8 -6 12 2" fill="none" stroke="#E8C36A" strokeWidth="2.5" />
      <path d="M30 6 l-6 16 M36 8 l-8 14" stroke="#8a6b3f" strokeWidth="2" />
    </>
  ),
  lasagna: (
    <>
      <path d="M8 18 h32 v18 a3 3 0 0 1 -3 3 H11 a3 3 0 0 1 -3 -3 Z" fill="#E8C36A" />
      <rect x="8" y="22" width="32" height="4" fill="#c9502e" stroke="none" />
      <rect x="8" y="30" width="32" height="4" fill="#c9502e" stroke="none" />
      <path d="M8 18 c8 -4 24 -4 32 0" fill="#f2d98a" />
    </>
  ),
  couscous: (
    <>
      <path d="M6 26 h36 l-4 12 a4 4 0 0 1 -4 3 H14 a4 4 0 0 1 -4 -3 Z" fill="#e8dcc0" />
      <path d="M10 26 c0 -8 28 -8 28 0 Z" fill="#f2d98a" />
      <circle cx="16" cy="24" r="2.5" fill="#E39B4A" stroke="none" />
      <circle cx="24" cy="21" r="2.5" fill="#7FB77E" stroke="none" />
      <circle cx="32" cy="24" r="2.5" fill="#d9503f" stroke="none" />
      <path d="M14 30 h20" stroke="#c9c2ae" strokeDasharray="1 2" />
    </>
  ),
  porridge: (
    <>
      <path d="M6 24 h36 c0 10 -8 16 -18 16 S6 34 6 24 Z" fill="#7a9fb8" />
      <path d="M8 24 c0 -6 32 -6 32 0 Z" fill="#e8c38a" />
      <circle cx="18" cy="21" r="2" fill="#4a5a9c" stroke="none" />
      <circle cx="26" cy="20" r="2" fill="#4a5a9c" stroke="none" />
      <circle cx="32" cy="22" r="2" fill="#d9503f" stroke="none" />
    </>
  ),
  pancakes: (
    <>
      <ellipse cx="24" cy="36" rx="16" ry="5" fill="#d9a55a" />
      <ellipse cx="24" cy="30" rx="16" ry="5" fill="#e8c38a" />
      <ellipse cx="24" cy="24" rx="16" ry="5" fill="#d9a55a" />
      <path d="M12 24 c4 4 20 4 24 0 c-2 6 -6 8 -10 6 c-4 2 -10 0 -14 -6 Z" fill="#c07a2a" stroke="none" />
      <rect x="20" y="16" width="8" height="5" fill="#f2d24a" />
    </>
  ),
  waffle: (
    <>
      <rect x="8" y="10" width="32" height="28" rx="4" fill="#d9a55a" />
      <path d="M16 10 v28 M24 10 v28 M32 10 v28 M8 18 h32 M8 26 h32 M8 34 h32" stroke="#a6702e" />
      <circle cx="30" cy="16" r="3" fill="#d9503f" stroke="none" />
    </>
  ),
  crepe: (
    <>
      <path d="M6 28 l18 -18 l18 18 Z" fill="#e8c38a" />
      <path d="M6 28 h36 c0 4 -8 6 -18 6 S6 32 6 28 Z" fill="#d9a55a" />
      <path d="M18 22 c4 -4 8 -4 12 0" fill="none" stroke="#5a3b26" />
    </>
  ),
  // --- Dishes ---
  hotdog: (
    <>
      <path d="M6 28 c0 -8 36 -8 36 0 c0 8 -36 8 -36 0 Z" fill="#d9a55a" />
      <path d="M8 26 c6 -6 26 -6 32 0" fill="none" stroke="#c2604a" strokeWidth="6" />
      <path d="M12 24 c4 -2 8 2 12 0 s8 -2 12 0" fill="none" stroke="#f2d24a" strokeWidth="2" />
    </>
  ),
  taco: (
    <>
      <path d="M6 30 a18 18 0 0 1 36 0 Z" fill="#E8C36A" />
      <path d="M10 30 c2 -6 6 -10 14 -10 s12 4 14 10 Z" fill="#7FB77E" />
      <path d="M14 30 c2 -3 6 -5 10 -5 s8 2 10 5 Z" fill="#c2604a" />
      <path d="M6 30 h36" />
    </>
  ),
  burrito: (
    <>
      <path d="M8 24 c0 -8 32 -8 32 0 v10 c0 8 -32 8 -32 0 Z" fill="#e8c38a" />
      <path d="M8 24 c0 -8 32 -8 32 0 c-8 4 -24 4 -32 0 Z" fill="#d9a55a" />
      <path d="M40 26 c-2 0 -3 2 -3 4 c0 4 3 5 3 5" fill="#c2604a" />
      <path d="M14 30 h18" stroke="#7FB77E" strokeWidth="2" />
    </>
  ),
  kebab: (
    <>
      <path d="M6 42 l36 -36" strokeWidth="2.5" stroke="#9aa396" />
      <rect x="10" y="26" width="10" height="10" rx="2" transform="rotate(-45 15 31)" fill="#c2604a" />
      <rect x="19" y="17" width="10" height="10" rx="2" transform="rotate(-45 24 22)" fill="#7FB77E" />
      <rect x="28" y="8" width="10" height="10" rx="2" transform="rotate(-45 33 13)" fill="#d9503f" />
    </>
  ),
  sushi: (
    <>
      <path d="M8 24 c0 -6 32 -6 32 0 v8 c0 6 -32 6 -32 0 Z" fill="#2a2f2a" />
      <ellipse cx="24" cy="24" rx="16" ry="3" fill="#f7f4ec" />
      <ellipse cx="24" cy="24" rx="8" ry="1.6" fill="#E39B4A" stroke="none" />
      <ellipse cx="24" cy="24" rx="4" ry="1" fill="#7FB77E" stroke="none" />
    </>
  ),
  dumpling: (
    <>
      <path d="M8 32 c0 -8 8 -16 16 -16 s16 8 16 16 Z" fill="#f2f0d8" />
      <path d="M12 20 c2 -2 4 0 6 -2 s4 0 6 -2 s4 0 6 -2 s4 0 6 -2" fill="none" stroke="#c9c2ae" />
      <path d="M8 32 h32 c0 4 -8 6 -16 6 S8 36 8 32 Z" fill="#e8dcc0" />
    </>
  ),
  quiche: (
    <>
      <path d="M6 24 h36 c0 6 -8 10 -18 10 S6 30 6 24 Z" fill="#d9a55a" />
      <path d="M10 24 c0 -8 28 -8 28 0 Z" fill="#E8C36A" />
      <path d="M8 24 h32" stroke="#a6702e" strokeDasharray="2 2" />
      <circle cx="18" cy="20" r="1.5" fill="#c2604a" stroke="none" />
      <circle cx="28" cy="19" r="1.5" fill="#c2604a" stroke="none" />
    </>
  ),
  curry: (
    <>
      <path d="M6 26 h36 c0 8 -8 14 -18 14 S6 34 6 26 Z" fill="#7a9fb8" />
      <path d="M8 26 c0 -6 32 -6 32 0 Z" fill="#e39b2a" />
      <path d="M26 24 c0 -6 12 -6 12 0 Z" fill="#f7f4ec" />
      <circle cx="16" cy="23" r="2" fill="#c2604a" stroke="none" />
      <path d="M12 14 c0 -3 3 -3 3 -6 M20 12 c0 -3 3 -3 3 -6" fill="none" stroke="#c9c2ae" />
    </>
  ),
  // --- Proteins ---
  sausage: (
    <>
      <path d="M8 30 c-4 -12 8 -22 22 -20 c10 2 14 12 10 20 c-2 4 -6 4 -8 0 c-2 -6 -10 -8 -16 -4 c-2 4 -6 6 -8 4 Z" fill="#b8563a" />
      <path d="M14 24 c4 -6 12 -8 20 -6" fill="none" stroke="#e08a6a" />
    </>
  ),
  bacon: (
    <>
      <path d="M6 16 c6 -6 12 6 18 0 s12 -6 18 0 v8 c-6 -6 -12 6 -18 0 s-12 6 -18 0 Z" fill="#c2604a" />
      <path d="M6 28 c6 -6 12 6 18 0 s12 -6 18 0 v8 c-6 -6 -12 6 -18 0 s-12 6 -18 0 Z" fill="#c2604a" />
      <path d="M8 20 c6 -6 12 6 18 0 s10 -6 14 0 M8 32 c6 -6 12 6 18 0 s10 -6 14 0" fill="none" stroke="#f2c5b2" strokeWidth="2" />
    </>
  ),
  ham: (
    <>
      <ellipse cx="24" cy="26" rx="17" ry="12" fill="#f0a0a0" />
      <ellipse cx="24" cy="26" rx="12" ry="8" fill="#e08a8a" />
      <circle cx="24" cy="26" r="3" fill="#f7f4ec" />
    </>
  ),
  meatball: (
    <>
      <path d="M6 30 h36 c0 6 -8 10 -18 10 S6 36 6 30 Z" fill="#e8dcc0" />
      <circle cx="16" cy="26" r="7" fill="#8a4a2a" />
      <circle cx="32" cy="26" r="7" fill="#8a4a2a" />
      <circle cx="24" cy="18" r="7" fill="#8a4a2a" />
      <path d="M12 30 c4 2 20 2 24 0" fill="none" stroke="#c9502e" strokeWidth="2" />
    </>
  ),
  drumstick: (
    <>
      <path d="M12 22 c-4 -10 6 -18 16 -14 c6 2 8 10 4 16 c-4 6 -12 8 -18 4 Z" fill="#d9a55a" />
      <path d="M14 30 l-6 8 M11 34 l5 3" stroke="#f7f4ec" strokeWidth="3.5" />
      <path d="M18 16 c4 -2 8 -1 10 2" fill="none" stroke="#a6702e" />
    </>
  ),
  shrimp: (
    <>
      <path d="M12 30 c-6 -12 6 -24 20 -20 c8 2 10 10 4 14 c-4 2 -6 -2 -8 0 c-4 4 -10 6 -16 6 Z" fill="#f08a6a" />
      <path d="M12 30 c-2 4 -4 6 -6 6 M12 30 c0 4 -1 7 -3 9" fill="none" />
      <path d="M18 24 c4 -6 10 -10 16 -10" fill="none" stroke="#f7b8a0" />
      <circle cx="34" cy="16" r="1.4" fill={OUTLINE} stroke="none" />
    </>
  ),
  tofu: (
    <>
      <path d="M8 18 l8 -6 h24 l-8 6 Z" fill="#f7f4ec" />
      <path d="M8 18 h24 v18 H8 Z" fill="#f2f0d8" />
      <path d="M32 18 l8 -6 v18 l-8 6 Z" fill="#e0dcc4" />
      <path d="M12 26 h8 M12 30 h6" stroke="#c9c2ae" />
    </>
  ),
  // --- Dairy ---
  milk: (
    <>
      <path d="M14 14 l4 -6 h12 l4 6 v24 a3 3 0 0 1 -3 3 H17 a3 3 0 0 1 -3 -3 Z" fill="#f7f4ec" />
      <path d="M14 14 h20" />
      <path d="M18 26 h12 v8 H18 Z" fill="#7a9fb8" stroke="none" />
    </>
  ),
  butter: (
    <>
      <path d="M8 26 h24 l8 -6 v10 l-8 6 H8 Z" fill="#f2d24a" />
      <path d="M8 26 h24 v10 H8 Z" fill="#f7e27a" />
      <path d="M32 26 l8 -6" />
      <path d="M4 40 h40" stroke="#9aa396" strokeWidth="2" />
    </>
  ),
  // --- Sweets and snacks ---
  pie: (
    <>
      <path d="M6 24 h36 c0 6 -8 10 -18 10 S6 30 6 24 Z" fill="#d9a55a" />
      <path d="M8 24 c0 -8 32 -8 32 0 Z" fill="#c2604a" />
      <path d="M12 22 l24 0 M16 18 l16 0 M18 24 l6 -8 l6 8" fill="none" stroke="#e8c38a" strokeWidth="2" />
      <path d="M8 24 h32" stroke="#a6702e" />
    </>
  ),
  donut: (
    <>
      <circle cx="24" cy="24" r="16" fill="#d9a55a" />
      <path d="M10 22 c2 -8 26 -8 28 0 c-2 4 -6 4 -8 2 c-2 2 -6 2 -8 0 c-2 2 -6 2 -8 0 c-2 2 -4 0 -4 -2 Z" fill="#e38ea5" />
      <circle cx="24" cy="24" r="5" fill="#1a1d1a" />
      <path d="M16 17 l2 -2 M28 15 l2 1 M22 19 l1 -2" stroke="#f7f4ec" />
    </>
  ),
  muffin: (
    <>
      <path d="M12 22 h24 l-3 16 a3 3 0 0 1 -3 2 H18 a3 3 0 0 1 -3 -2 Z" fill="#e8c38a" />
      <path d="M16 22 v14 M24 22 v16 M32 22 v14" stroke="#c8a06a" />
      <path d="M10 22 c0 -12 28 -12 28 0 Z" fill="#d9a55a" />
      <circle cx="19" cy="17" r="1.5" fill="#5a3b26" stroke="none" />
      <circle cx="28" cy="15" r="1.5" fill="#5a3b26" stroke="none" />
    </>
  ),
  popcorn: (
    <>
      <path d="M12 22 h24 l-3 18 H15 Z" fill="#d9503f" />
      <path d="M18 22 v18 M24 22 v18 M30 22 v18" stroke="#f7f4ec" strokeWidth="2.5" />
      <circle cx="16" cy="18" r="5" fill="#f7f4ec" />
      <circle cx="24" cy="14" r="5" fill="#f2d98a" />
      <circle cx="32" cy="18" r="5" fill="#f7f4ec" />
    </>
  ),
  chips: (
    <>
      <path d="M12 8 h24 l-2 32 H14 Z" fill="#f2d24a" />
      <path d="M12 8 h24 v6 H12 Z" fill="#d9503f" />
      <path d="M18 26 c2 -6 8 -6 12 -2 c-2 4 -8 6 -12 2 Z" fill="#e8c38a" />
      <path d="M17 34 c3 -5 9 -5 11 -1" fill="#e8c38a" />
    </>
  ),
  pretzel: (
    <>
      <path d="M12 34 c-8 -10 2 -22 12 -14 c10 -8 20 4 12 14 M12 34 c6 -10 18 -10 24 0 M18 22 c2 6 4 10 6 12 M30 22 c-2 6 -4 10 -6 12" fill="none" stroke="#a6702e" strokeWidth="5" />
      <path d="M12 34 c-8 -10 2 -22 12 -14 c10 -8 20 4 12 14 M12 34 c6 -10 18 -10 24 0" fill="none" stroke="#d9a55a" strokeWidth="2.5" />
      <path d="M16 20 h1 M32 20 h1 M24 36 h1" stroke="#f7f4ec" strokeWidth="2" />
    </>
  ),
  honey: (
    <>
      <path d="M14 18 h20 v18 a4 4 0 0 1 -4 4 H18 a4 4 0 0 1 -4 -4 Z" fill="#e39b2a" />
      <rect x="16" y="12" width="16" height="6" rx="1" fill="#8a6b3f" />
      <path d="M18 24 l3 -2 l3 2 v4 l-3 2 l-3 -2 Z M26 28 l3 -2 l3 2 v4 l-3 2 l-3 -2 Z" fill="#f2d24a" stroke="#c07a2a" />
    </>
  ),
  jam: (
    <>
      <path d="M12 18 h24 v18 a4 4 0 0 1 -4 4 H16 a4 4 0 0 1 -4 -4 Z" fill="#b83a5a" />
      <path d="M10 12 h28 v6 H10 Z" fill="#e8dcc0" />
      <path d="M16 26 h8 v6 h-8 Z" fill="#f7f4ec" stroke="none" />
      <circle cx="30" cy="30" r="2" fill="#d9503f" stroke="none" />
    </>
  ),
  sauce: (
    <>
      <path d="M16 16 h16 v22 a3 3 0 0 1 -3 3 H19 a3 3 0 0 1 -3 -3 Z" fill="#d9503f" />
      <path d="M20 8 h8 v4 l4 4 H16 l4 -4 Z" fill="#f7f4ec" />
      <path d="M19 24 h10 v8 H19 Z" fill="#f7f4ec" stroke="none" />
    </>
  ),
  // --- Drinks ---
  juice: (
    <>
      <path d="M14 12 h20 l-2 26 a3 3 0 0 1 -3 2 H19 a3 3 0 0 1 -3 -2 Z" fill="#f7f4ec" />
      <path d="M15 22 h18 l-1 14 H16 Z" fill="#E39B4A" stroke="none" />
      <path d="M30 6 l-2 8" stroke="#9aa396" strokeWidth="2.5" />
      <circle cx="30" cy="16" r="3" fill="#E39B4A" />
    </>
  ),
  water: (
    <>
      <path d="M16 12 h16 v26 a3 3 0 0 1 -3 3 H19 a3 3 0 0 1 -3 -3 Z" fill="#c8e0f0" />
      <path d="M17 24 h14 v12 H17 Z" fill="#7a9fb8" stroke="none" />
      <path d="M22 28 c2 -2 4 -2 6 0 M20 33 c2 -2 4 -2 6 0" fill="none" stroke="#c8e0f0" />
      <path d="M14 12 h20" />
    </>
  ),
  tea: (
    <>
      <path d="M8 20 h26 v8 c0 8 -6 12 -13 12 S8 36 8 28 Z" fill="#f7f4ec" />
      <path d="M34 24 c6 0 6 10 0 10" fill="none" />
      <path d="M8 20 h26 v3 H8 Z" fill="#c8a06a" />
      <path d="M22 8 l6 10" stroke="#9aa396" />
      <rect x="26" y="4" width="8" height="6" rx="1" fill="#7FB77E" />
    </>
  ),
  beer: (
    <>
      <path d="M12 14 h20 v24 a3 3 0 0 1 -3 3 H15 a3 3 0 0 1 -3 -3 Z" fill="#f2b84a" />
      <path d="M32 20 c6 0 6 12 0 12" fill="none" />
      <path d="M10 14 c2 -8 22 -8 24 0 c-4 4 -20 4 -24 0 Z" fill="#f7f4ec" />
      <path d="M17 22 v14 M22 22 v14" stroke="#f7e27a" />
    </>
  ),
  wine: (
    <>
      <path d="M14 6 h20 c0 12 -4 18 -10 18 S14 18 14 6 Z" fill="#c8e0f0" />
      <path d="M15 12 h18 c-1 6 -4 10 -9 10 s-8 -4 -9 -10 Z" fill="#8a2a4a" stroke="none" />
      <path d="M24 24 v14 M16 40 h16" strokeWidth="2" />
    </>
  ),
  smoothie: (
    <>
      <path d="M14 10 h20 l-3 28 a3 3 0 0 1 -3 2 H20 a3 3 0 0 1 -3 -2 Z" fill="#c2405a" />
      <path d="M12 10 h24 v4 H12 Z" fill="#f7f4ec" />
      <path d="M28 4 l-4 12" stroke="#7FB77E" strokeWidth="2.5" />
      <circle cx="22" cy="24" r="2" fill="#f0b8c8" stroke="none" />
      <circle cx="27" cy="30" r="1.5" fill="#f0b8c8" stroke="none" />
    </>
  ),
  milkshake: (
    <>
      <path d="M14 16 h20 l-3 22 a3 3 0 0 1 -3 2 H20 a3 3 0 0 1 -3 -2 Z" fill="#f0b8c8" />
      <path d="M12 16 c2 -8 22 -8 24 0 c-4 3 -20 3 -24 0 Z" fill="#f7f4ec" />
      <path d="M30 4 l-4 12" stroke="#d9503f" strokeWidth="2.5" />
      <circle cx="18" cy="10" r="2.5" fill="#d9503f" />
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
