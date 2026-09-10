import type { AccessoryRenderer } from "./index";

const BRASS = "#E8C36A";
const BRASS_DARK = "#A6823A";

/** Neck accessories: anchor = base of the head / top of the body. */
export const NECK_ACCESSORIES: Record<string, AccessoryRenderer> = {
  scarf: {
    front: () => (
      <g transform="translate(0 1)">
        <path d="M-13 -2 Q0 5 13 -2 Q0 10 -13 -2 Z" fill="#D9666B" />
        <path d="M5 4 L8.5 14 L3 12.5 Z" fill="#D9666B" />
        <path d="M-9 0 Q0 5 9 0" stroke="#A63F45" strokeWidth="0.8" fill="none" />
      </g>
    ),
  },
  bow_tie: {
    front: () => (
      <g transform="translate(0 2)">
        <path d="M0 0 L-8 -5 L-7.5 5 Z M0 0 L8 -5 L7.5 5 Z" fill="#2B2B2B" />
        <circle r="2" fill="#D9666B" />
      </g>
    ),
  },
  bandana: {
    front: () => (
      <g transform="translate(0 1)">
        <path d="M-13 -1 Q0 5 13 -1 L1 13 Z" fill="#4A6FD6" />
        <circle cx="-4" cy="4" r="0.9" fill="#F7F4EC" />
        <circle cx="3" cy="6" r="0.9" fill="#F7F4EC" />
        <circle cx="0" cy="1.5" r="0.9" fill="#F7F4EC" />
      </g>
    ),
  },
  bell_collar: {
    front: () => (
      <g transform="translate(0 2)">
        <path d="M-13 -3 Q0 3 13 -3" stroke="#D9666B" strokeWidth="2.4" fill="none" />
        <path d="M-4 4 C-4 -2 4 -2 4 4 L5.2 6.5 L-5.2 6.5 Z" fill={BRASS} stroke={BRASS_DARK} strokeWidth="0.6" />
        <circle cx="0" cy="6.6" r="1.1" fill={BRASS_DARK} />
      </g>
    ),
  },
  kerchief: {
    front: () => (
      <g transform="translate(0 1)">
        <path d="M-12 -2 Q0 4 12 -2 L0 11 Z" fill="#F0D68F" />
        <circle cx="-3" cy="3" r="0.8" fill="#D9666B" />
        <circle cx="3" cy="5" r="0.8" fill="#D9666B" />
      </g>
    ),
  },
  pearl_necklace: {
    front: () => (
      <g transform="translate(0 2)">
        {[-12, -8, -4, 0, 4, 8, 12].map((x) => (
          <circle key={x} cx={x} cy={Math.abs(x) * -0.18 + 2.5} r="1.7" fill="#F7F4EC" stroke="#D9D5C8" strokeWidth="0.4" />
        ))}
      </g>
    ),
  },
  medal: {
    front: () => (
      <g transform="translate(0 1)">
        <path d="M-9 -3 L-2 8 L0 6 L-6 -4 Z" fill="#4A6FD6" />
        <path d="M9 -3 L2 8 L0 6 L6 -4 Z" fill="#D9666B" />
        <circle cx="0" cy="10" r="4.5" fill={BRASS} stroke={BRASS_DARK} strokeWidth="0.7" />
        <path d="M0 7.2 l0.8 2 2.1 0.2 -1.6 1.4 0.5 2.1 -1.8 -1.1 -1.8 1.1 0.5 -2.1 -1.6 -1.4 2.1 -0.2 z" fill={BRASS_DARK} />
      </g>
    ),
  },
};
