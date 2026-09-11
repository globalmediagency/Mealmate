import type { AccessoryRenderer } from "./index";

/** Body accessories: anchor = centre of the body. */
export const BODY_ACCESSORIES: Record<string, AccessoryRenderer> = {
  apron: {
    front: () => (
      <g>
        <path d="M-9 -14 L9 -14 L12 14 L-12 14 Z" fill="#F7F4EC" stroke="#D9D5C8" strokeWidth="0.6" />
        <path d="M-9 -14 L-14 -18 M9 -14 L14 -18" stroke="#D9D5C8" strokeWidth="1.4" strokeLinecap="round" />
        <rect x="-6" y="0" width="12" height="8" rx="1.5" fill="#E8D3B8" />
        <path d="M-5 -10 L5 -10" stroke="#D9666B" strokeWidth="1.2" strokeLinecap="round" />
      </g>
    ),
  },
  vest: {
    front: () => (
      <g>
        <path d="M-14 -12 C-10 -8 -4 -8 -1 -14 L-1 12 L-13 12 Z" fill="#5E7053" />
        <path d="M14 -12 C10 -8 4 -8 1 -14 L1 12 L13 12 Z" fill="#5E7053" />
        <circle cx="-4" cy="-1" r="1.1" fill="#E8C36A" />
        <circle cx="-4" cy="5" r="1.1" fill="#E8C36A" />
        <path d="M-13 8 L-9 4 M13 8 L9 4" stroke="#3F4C38" strokeWidth="0.8" />
      </g>
    ),
  },
  backpack: {
    back: () => (
      <g>
        <rect x="-17" y="-16" width="34" height="26" rx="7" fill="#A6823A" />
        <rect x="-15" y="-19" width="30" height="8" rx="4" fill="#C9A24E" />
      </g>
    ),
    front: () => (
      <g>
        <path d="M-9 -18 C-11 -8 -11 2 -9 10" stroke="#A6823A" strokeWidth="3.5" strokeLinecap="round" fill="none" />
        <path d="M9 -18 C11 -8 11 2 9 10" stroke="#A6823A" strokeWidth="3.5" strokeLinecap="round" fill="none" />
        <rect x="-10" y="-4" width="3" height="4" rx="0.8" fill="#5E4630" />
        <rect x="7" y="-4" width="3" height="4" rx="0.8" fill="#5E4630" />
      </g>
    ),
  },
  cape: {
    back: () => (
      <g>
        <path d="M-12 -14 C-14 -2 -22 8 -24 22 L24 22 C22 8 14 -2 12 -14 Z" fill="#D9666B" />
        <path d="M-6 -12 C-8 0 -10 10 -12 22 M6 -12 C8 0 10 10 12 22" stroke="#A63F45" strokeWidth="0.8" fill="none" opacity="0.7" />
      </g>
    ),
    front: () => (
      <g transform="translate(0 -14)">
        <path d="M-12 -1 Q0 4 12 -1" stroke="#A63F45" strokeWidth="2.2" fill="none" />
        <circle r="2.2" fill="#E8C36A" />
      </g>
    ),
  },
  butterfly_wings: {
    back: () => (
      <g>
        <g transform="translate(-10 -2)">
          <g className="mm-flap" style={{ transformOrigin: "100% 60%" }}>
            <path d="M0 0 C-14 -22 -30 -18 -26 -4 C-24 2 -14 4 0 0 Z" fill="#B48AE0" stroke="#7C5FB8" strokeWidth="0.6" />
            <path d="M0 2 C-12 4 -24 12 -18 18 C-14 22 -4 12 0 2 Z" fill="#F0D68F" stroke="#C9A24E" strokeWidth="0.6" />
            <circle cx="-16" cy="-8" r="2.4" fill="#F7F4EC" opacity="0.8" />
          </g>
        </g>
        <g transform="translate(10 -2) scale(-1 1)">
          <g className="mm-flap" style={{ transformOrigin: "100% 60%" }}>
            <path d="M0 0 C-14 -22 -30 -18 -26 -4 C-24 2 -14 4 0 0 Z" fill="#B48AE0" stroke="#7C5FB8" strokeWidth="0.6" />
            <path d="M0 2 C-12 4 -24 12 -18 18 C-14 22 -4 12 0 2 Z" fill="#F0D68F" stroke="#C9A24E" strokeWidth="0.6" />
            <circle cx="-16" cy="-8" r="2.4" fill="#F7F4EC" opacity="0.8" />
          </g>
        </g>
      </g>
    ),
  },
  // Coaching rewards
  student_satchel: {
    back: () => (
      <g>
        <rect x="-15" y="-12" width="30" height="22" rx="5" fill="#8C5A3A" />
        <path d="M-15 -8 L15 -8 L15 -1 L-15 -1 Z" fill="#A6703F" />
        <rect x="-3" y="-4" width="6" height="4" rx="1" fill="#E8C36A" />
      </g>
    ),
    front: () => (
      <g>
        <path d="M-8 -18 C-10 -8 -10 2 -8 10" stroke="#8C5A3A" strokeWidth="3" strokeLinecap="round" fill="none" />
        <path d="M8 -18 C10 -8 10 2 8 10" stroke="#8C5A3A" strokeWidth="3" strokeLinecap="round" fill="none" />
      </g>
    ),
  },
  coach_whip: {
    front: () => (
      <g transform="translate(11 2)">
        <rect x="-2" y="-8" width="4" height="9" rx="1.4" fill="#5E4630" />
        <path d="M-1 -8 L1 -8" stroke="#E8C36A" strokeWidth="1" />
        <path d="M0 1 C6 3 6 9 1 10 C-4 11 -4 5 1 4 C4 3 5 8 1 8" stroke="#8C5A3A" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      </g>
    ),
  },
};
