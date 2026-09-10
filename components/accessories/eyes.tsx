import type { AccessoryRenderer } from "./index";

const BRASS = "#E8C36A";
const STAR = "M0 -6 L1.6 -1.9 L6 -1.9 L2.4 0.8 L3.7 5 L0 2.4 L-3.7 5 L-2.4 0.8 L-6 -1.9 L-1.6 -1.9 Z";

/** Eye accessories: anchor = centre of the eye line; lenses at x = ±9. */
export const EYES_ACCESSORIES: Record<string, AccessoryRenderer> = {
  round_glasses: {
    front: () => (
      <g stroke={BRASS} strokeWidth="1.3" fill="none">
        <circle cx="-9" cy="0" r="6" fill="rgba(255,255,255,0.08)" />
        <circle cx="9" cy="0" r="6" fill="rgba(255,255,255,0.08)" />
        <path d="M-3 0 Q0 -2 3 0" />
        <path d="M-15 -1 L-19 -3 M15 -1 L19 -3" />
      </g>
    ),
  },
  sunglasses: {
    front: () => (
      <g>
        <rect x="-16" y="-5" width="13" height="10" rx="4" fill="#1a1a1a" />
        <rect x="3" y="-5" width="13" height="10" rx="4" fill="#1a1a1a" />
        <path d="M-3 -2 L3 -2" stroke="#1a1a1a" strokeWidth="1.6" />
        <path d="M-13 -3 L-8 -3" stroke="#fff" strokeWidth="1" strokeLinecap="round" opacity="0.6" />
        <path d="M6 -3 L11 -3" stroke="#fff" strokeWidth="1" strokeLinecap="round" opacity="0.6" />
      </g>
    ),
  },
  goggles: {
    front: () => (
      <g>
        <path d="M-15 -2 C-10 -8 10 -8 15 -2" stroke="#2B2B2B" strokeWidth="1.6" fill="none" />
        <circle cx="-9" cy="0" r="6.5" fill="rgba(125,167,217,0.45)" stroke="#F7F4EC" strokeWidth="1.5" />
        <circle cx="9" cy="0" r="6.5" fill="rgba(125,167,217,0.45)" stroke="#F7F4EC" strokeWidth="1.5" />
        <path d="M-2.5 0 L2.5 0" stroke="#F7F4EC" strokeWidth="1.6" />
      </g>
    ),
  },
  monocle: {
    front: () => (
      <g>
        <circle cx="9" cy="0" r="6.6" stroke={BRASS} strokeWidth="1.4" fill="rgba(255,255,255,0.08)" />
        <path d="M14 4 q3 7 1 13" stroke={BRASS} strokeWidth="0.8" fill="none" />
      </g>
    ),
  },
  hero_mask: {
    front: () => (
      <path
        d="M-19 -1 C-15 -9 -3 -8 0 -4 C3 -8 15 -9 19 -1 C17 6 8 8 3 4 C1 2 -1 2 -3 4 C-8 8 -17 6 -19 -1 Z M-9 -1 a4.5 4 0 1 0 0.01 0 Z M9 -1 a4.5 4 0 1 0 0.01 0 Z"
        fillRule="evenodd"
        fill="#D9666B"
        stroke="#A63F45"
        strokeWidth="0.6"
      />
    ),
  },
  star_glasses: {
    front: () => (
      <g>
        <path d={STAR} transform="translate(-9 0) scale(1.35)" fill="rgba(240,214,143,0.35)" stroke="#F0D68F" strokeWidth="0.9" />
        <path d={STAR} transform="translate(9 0) scale(1.35)" fill="rgba(240,214,143,0.35)" stroke="#F0D68F" strokeWidth="0.9" />
        <path d="M-2 0 L2 0" stroke="#F0D68F" strokeWidth="1.2" />
      </g>
    ),
  },
};
