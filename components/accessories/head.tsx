import type { AccessoryRenderer } from "./index";

const BRASS = "#E8C36A";
const BRASS_DARK = "#A6823A";

/** Head accessories: anchor = top of the head, y grows downward. */
export const HEAD_ACCESSORIES: Record<string, AccessoryRenderer> = {
  straw_hat: {
    front: () => (
      <g>
        <ellipse cx="0" cy="1.5" rx="21" ry="4.2" fill="#E8C36A" stroke={BRASS_DARK} strokeWidth="0.6" />
        <path d="M-12 1.5 C-12 -10 12 -10 12 1.5 Z" fill="#F0D68F" stroke={BRASS_DARK} strokeWidth="0.6" />
        <path d="M-12 -1 C-8 -3 8 -3 12 -1 L12 1.5 L-12 1.5 Z" fill="#D9666B" />
      </g>
    ),
  },
  beret: {
    front: () => (
      <g>
        <path d="M-14 1 C-16 -9 16 -9 14 1 Z" fill="#D9666B" />
        <path d="M-12 1 L12 1" stroke="#A63F45" strokeWidth="2" strokeLinecap="round" />
        <path d="M0 -8 l1 -3" stroke="#A63F45" strokeWidth="1.6" strokeLinecap="round" />
      </g>
    ),
  },
  beanie: {
    front: () => (
      <g>
        <path d="M-12 2 C-12 -13 12 -13 12 2 Z" fill="#7DA7D9" />
        <rect x="-13" y="-1" width="26" height="5" rx="2" fill="#4A6FA5" />
        <circle cx="0" cy="-13" r="3" fill="#F7F4EC" />
      </g>
    ),
  },
  cap: {
    front: () => (
      <g>
        <path d="M-12 1 C-12 -11 12 -11 12 1 Z" fill="#4A6FD6" />
        <path d="M0 -10 L0 1" stroke="#2A3F8C" strokeWidth="0.8" />
        <path d="M2 0 L19 3 L19 6 L2 4.5 Z" fill="#2A3F8C" />
        <circle cx="0" cy="-10" r="1.2" fill="#2A3F8C" />
      </g>
    ),
  },
  nightcap: {
    front: () => (
      <g transform="rotate(-14)">
        <path d="M-12 2 L12 2 L4 -16 Z" fill="#B48AE0" />
        <rect x="-13" y="0" width="26" height="4" rx="2" fill="#F7F4EC" />
        <circle cx="4" cy="-16" r="2.6" fill="#F7F4EC" />
      </g>
    ),
  },
  head_bow: {
    front: () => (
      <g transform="translate(9 -1)">
        <path d="M0 0 L-7 -4.5 L-6.5 4 Z M0 0 L7 -4.5 L6.5 4 Z" fill="#E38EA5" />
        <circle r="2" fill="#C45B7A" />
      </g>
    ),
  },
  flower_crown: {
    front: () => (
      <g>
        <path d="M-14 2 C-8 -3 8 -3 14 2" stroke="#5E7053" strokeWidth="1.6" fill="none" />
        {[-11, -5.5, 0, 5.5, 11].map((x, i) => (
          <g key={x} transform={`translate(${x} ${-1 - (i === 2 ? 2 : i % 2 === 0 ? 0 : 1)})`}>
            {[0, 72, 144, 216, 288].map((a) => (
              <circle key={a} cx="0" cy="-2" r="1.5" fill={i % 2 === 0 ? "#F0A9B0" : "#F0D68F"} transform={`rotate(${a})`} />
            ))}
            <circle r="1" fill={BRASS_DARK} />
          </g>
        ))}
      </g>
    ),
  },
  top_hat: {
    front: () => (
      <g>
        <rect x="-16" y="0" width="32" height="3.5" rx="1.75" fill="#2B2B2B" />
        <rect x="-11" y="-20" width="22" height="21" rx="1.5" fill="#2B2B2B" />
        <rect x="-11" y="-5" width="22" height="3.5" fill="#D9666B" />
      </g>
    ),
  },
  viking_helmet: {
    front: () => (
      <g>
        <path d="M-13 2 C-13 -12 13 -12 13 2 Z" fill="#8A8F96" stroke="#4E535A" strokeWidth="0.7" />
        <path d="M-13 1 L13 1" stroke="#4E535A" strokeWidth="1.5" />
        <path d="M-12 -4 C-18 -8 -19 -16 -15 -20 C-16 -13 -13 -9 -9 -6 Z" fill="#F7F4EC" stroke="#B8BEC6" strokeWidth="0.5" />
        <path d="M12 -4 C18 -8 19 -16 15 -20 C16 -13 13 -9 9 -6 Z" fill="#F7F4EC" stroke="#B8BEC6" strokeWidth="0.5" />
        <circle cx="0" cy="-4" r="1.2" fill="#4E535A" />
      </g>
    ),
  },
  wizard_hat: {
    front: () => (
      <g>
        <ellipse cx="0" cy="1.5" rx="17" ry="3.6" fill="#5F4B9C" stroke="#3A2F6B" strokeWidth="0.6" />
        <path d="M-11 1 L11 1 L3 -27 Z" fill="#5F4B9C" stroke="#3A2F6B" strokeWidth="0.6" />
        <path d="M-9 -2 C-3 -4 5 -4 9 -2" stroke="#F0D68F" strokeWidth="1.6" fill="none" />
        <path d="M0 -14 l0.9 2.4 2.4 0.9 -2.4 0.9 -0.9 2.4 -0.9 -2.4 -2.4 -0.9 2.4 -0.9 z" fill="#F0D68F" />
        <circle cx="5" cy="-8" r="0.9" fill="#F0D68F" />
      </g>
    ),
  },
  crown: {
    front: () => (
      <g transform="translate(0 2)">
        <path d="M-10 3 L-10 -8 L-5 -2 L0 -10 L5 -2 L10 -8 L10 3 Z" fill={BRASS} stroke={BRASS_DARK} strokeWidth="0.8" strokeLinejoin="round" />
        <circle cx="-5" cy="0" r="1.2" fill="#D9666B" />
        <circle cx="0" cy="-1.5" r="1.2" fill="#7DA7D9" />
        <circle cx="5" cy="0" r="1.2" fill="#7FB77E" />
      </g>
    ),
  },
  halo: {
    front: () => (
      <g className="mm-float">
        <ellipse cx="0" cy="-7" rx="11" ry="3.4" stroke="#F0D68F" strokeWidth="2.2" fill="none" />
        <ellipse cx="0" cy="-7" rx="11" ry="3.4" stroke="#fff" strokeWidth="0.8" fill="none" opacity="0.6" />
      </g>
    ),
  },
};
