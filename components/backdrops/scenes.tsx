import type { ReactNode } from "react";
import type { BackdropId } from "@/lib/backdrops/catalog";
import type { Tier } from "@/lib/game/config";

/**
 * The fifteen scenes drawn behind the creature (viewBox 400 × 300, ground at
 * the bottom, the creature stands around y = 300). Colours are scene paint,
 * not interface tokens: each design's scene borrows its palette so the card
 * blends with the page, the chest scenes tell their own story. `uid` prefixes
 * gradient ids so several scenes can share a page.
 */
export type SceneProps = { tier: Tier; uid: string };

type Scene = (props: SceneProps) => ReactNode;

/** Deterministic star field: the same sky at every render, without a random generator. */
function stars(count: number, seed: number, maxY: number, color: string, twinkle = true): ReactNode {
  const items: ReactNode[] = [];
  for (let i = 0; i < count; i++) {
    const x = ((i * 97 + seed * 13) % 397) + 2;
    const y = ((i * 61 + seed * 7) % maxY) + 4;
    const r = 0.7 + ((i * 3 + seed) % 4) * 0.35;
    items.push(<circle key={i} cx={x} cy={y} r={r} fill={color} className={twinkle && i % 3 === 0 ? "mm-twinkle" : undefined} style={twinkle && i % 3 === 0 ? { animationDelay: `${(i % 7) * 0.3}s` } : undefined} />);
  }
  return <g opacity="0.85">{items}</g>;
}

const foret: Scene = ({ tier, uid }) => (
  <>
    <defs>
      <radialGradient id={`${uid}-sky`} cx="0.5" cy="0.15" r="0.8">
        <stop offset="0" stopColor={tier === "difficile" ? "#3a2f6b" : tier === "moyen" ? "#24331f" : "#2b3a2a"} />
        <stop offset="1" stopColor="#0b0d0b" />
      </radialGradient>
      <linearGradient id={`${uid}-hill1`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={tier === "difficile" ? "#5f4b9c" : tier === "moyen" ? "#3f5a38" : "#5e7053"} />
        <stop offset="1" stopColor={tier === "difficile" ? "#241a4a" : "#1a201a"} />
      </linearGradient>
      <linearGradient id={`${uid}-hill2`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={tier === "difficile" ? "#7c69b8" : tier === "moyen" ? "#5e7053" : "#8ba07a"} />
        <stop offset="1" stopColor={tier === "difficile" ? "#3a2f6b" : "#3f4c38"} />
      </linearGradient>
    </defs>
    <rect width="400" height="300" fill={`url(#${uid}-sky)`} />
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
    <path d="M0 230 C80 190 160 210 240 200 C320 190 360 210 400 200 L400 300 L0 300 Z" fill={`url(#${uid}-hill1)`} />
    <path d="M0 262 C100 236 200 250 300 240 C340 236 380 244 400 250 L400 300 L0 300 Z" fill={`url(#${uid}-hill2)`} />
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
  </>
);

const sable: Scene = ({ tier, uid }) => (
  <>
    <defs>
      <linearGradient id={`${uid}-sky`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#f3f2e7" />
        <stop offset="1" stopColor="#e9e2d1" />
      </linearGradient>
      <linearGradient id={`${uid}-dune`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#e3dac8" />
        <stop offset="1" stopColor="#cbb2a1" />
      </linearGradient>
    </defs>
    <rect width="400" height="300" fill={`url(#${uid}-sky)`} />
    <circle cx="300" cy="78" r="30" fill="#fffefa" />
    <circle cx="300" cy="78" r="46" fill="#e0cdb9" opacity="0.3" />
    <circle cx="300" cy="78" r="70" fill="#e0cdb9" opacity="0.12" />
    {tier !== "facile" ? <path d="M20 205 l22 -26 l18 14 l16 -22 l26 34 z" fill="#b89f8c" opacity="0.55" /> : null}
    {tier === "difficile" ? <path d="M330 200 l16 -30 l14 18 l12 -14 l18 26 z" fill="#b89f8c" opacity="0.45" /> : null}
    <path d="M0 215 C90 190 170 225 260 205 C320 192 370 205 400 198 L400 300 L0 300 Z" fill="#e0d3bd" />
    <path d="M0 240 C120 215 220 255 400 225 L400 300 L0 300 Z" fill={`url(#${uid}-dune)`} />
    <path d="M0 268 C140 250 260 280 400 258 L400 300 L0 300 Z" fill="#cbb2a1" />
    <g stroke="#7e746a" strokeWidth="1.6" strokeLinecap="round" opacity="0.7" fill="none">
      <path d="M60 268 q-2 -12 4 -20 M66 268 q3 -10 10 -14 M330 258 q-2 -10 3 -16 M336 258 q4 -9 11 -11" />
    </g>
    <g fill="#b89f8c" opacity="0.8">
      <ellipse cx="120" cy="284" rx="6" ry="2.5" />
      <ellipse cx="290" cy="280" rx="4" ry="1.8" />
    </g>
  </>
);

const plage: Scene = ({ tier, uid }) => (
  <>
    <defs>
      <linearGradient id={`${uid}-sky`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#cadfe1" />
        <stop offset="1" stopColor="#edf3f4" />
      </linearGradient>
      <linearGradient id={`${uid}-sea`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#59838f" />
        <stop offset="1" stopColor="#7ba5b3" />
      </linearGradient>
    </defs>
    <rect width="400" height="300" fill={`url(#${uid}-sky)`} />
    <circle cx="90" cy="70" r="24" fill="#fdfefe" opacity="0.9" />
    <g stroke="#44626d" strokeWidth="1.6" fill="none" strokeLinecap="round" opacity="0.7">
      <path d="M240 60 q6 -6 12 0 q6 -6 12 0" />
      <path d="M280 84 q5 -5 10 0 q5 -5 10 0" />
    </g>
    <rect x="0" y="170" width="400" height="80" fill={`url(#${uid}-sea)`} />
    <g stroke="#fdfefe" strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.8">
      <path d="M20 190 q14 -6 28 0 q14 6 28 0" className="mm-float" />
      <path d="M200 205 q16 -6 32 0 q16 6 32 0" className="mm-float" style={{ animationDelay: "0.7s" }} />
      <path d="M320 186 q12 -5 24 0" className="mm-float" style={{ animationDelay: "1.3s" }} />
    </g>
    {tier === "difficile" ? <path d="M330 168 l10 -22 l5 22 z M336 168 l4 -16 l2 16 z" fill="#fdfefe" opacity="0.85" /> : null}
    <path d="M0 236 C100 224 200 250 400 232 L400 300 L0 300 Z" fill="#e7d6c6" />
    <path d="M0 262 C120 252 260 276 400 260 L400 300 L0 300 Z" fill="#d5b099" />
    <path d="M0 240 C100 230 200 254 400 236 L400 244 C200 262 100 238 0 248 Z" fill="#fdfefe" opacity="0.7" />
    <g fill="#f3e6e3" stroke="#c9a3a0" strokeWidth="1">
      <path d="M96 276 c-6 -8 0 -16 8 -14 c8 2 10 10 4 15 z" />
    </g>
    {tier !== "facile" ? (
      <g fill="#7f9eaa" opacity="0.7">
        <circle cx="300" cy="280" r="2.5" />
        <circle cx="310" cy="284" r="1.8" />
      </g>
    ) : null}
  </>
);

const rose: Scene = ({ tier, uid }) => (
  <>
    <defs>
      <linearGradient id={`${uid}-sky`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#faf3f1" />
        <stop offset="1" stopColor="#f2d9d6" />
      </linearGradient>
    </defs>
    <rect width="400" height="300" fill={`url(#${uid}-sky)`} />
    <circle cx="310" cy="80" r="34" fill="#ead9bf" opacity="0.8" />
    <circle cx="310" cy="80" r="56" fill="#ead9bf" opacity="0.25" />
    <path d="M0 226 C90 200 170 232 260 212 C330 198 370 214 400 206 L400 300 L0 300 Z" fill="#e8d3cf" />
    <path d="M0 254 C120 236 240 268 400 244 L400 300 L0 300 Z" fill="#d9bbb7" />
    <g fill="#c98b8f">
      <circle cx="52" cy="238" r="16" />
      <circle cx="72" cy="246" r="12" />
      <circle cx="340" cy="236" r="18" />
      <circle cx="362" cy="246" r="11" />
      {tier !== "facile" ? <circle cx="200" cy="222" r="12" /> : null}
    </g>
    <g fill="#b5737b">
      <circle cx="46" cy="232" r="3" />
      <circle cx="62" cy="242" r="2.6" />
      <circle cx="334" cy="230" r="3" />
      <circle cx="352" cy="244" r="2.4" />
      {tier !== "facile" ? <circle cx="196" cy="218" r="2.6" /> : null}
    </g>
    <g fill="#f2d9d6" opacity="0.9">
      <circle cx="40" cy="240" r="1.6" />
      <circle cx="70" cy="236" r="1.6" />
      <circle cx="346" cy="240" r="1.6" />
    </g>
    <g fill="#d2b48c" opacity="0.85">
      <ellipse cx="120" cy="120" rx="4" ry="2.2" className="mm-float" />
      <ellipse cx="250" cy="150" rx="3.6" ry="2" className="mm-float" style={{ animationDelay: "1.1s" }} />
      <ellipse cx="180" cy="70" rx="3" ry="1.8" className="mm-float" style={{ animationDelay: "0.5s" }} />
    </g>
    <g fill="#c98b8f" opacity="0.7">
      <ellipse cx="90" cy="180" rx="3.4" ry="1.8" className="mm-float" style={{ animationDelay: "1.6s" }} />
      <ellipse cx="300" cy="140" rx="3.4" ry="1.8" className="mm-float" style={{ animationDelay: "0.2s" }} />
    </g>
  </>
);

const velours: Scene = ({ tier, uid }) => (
  <>
    <defs>
      <linearGradient id={`${uid}-wall`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#1e1a24" />
        <stop offset="1" stopColor="#0e0c11" />
      </linearGradient>
      <linearGradient id={`${uid}-curtain`} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#4a3340" />
        <stop offset="0.5" stopColor="#6e4c5c" />
        <stop offset="1" stopColor="#4a3340" />
      </linearGradient>
    </defs>
    <rect width="400" height="300" fill={`url(#${uid}-wall)`} />
    <ellipse cx="200" cy="120" rx="150" ry="110" fill="#d9b95e" opacity="0.08" />
    <g fill={`url(#${uid}-curtain)`}>
      <path d="M0 0 H70 C70 90 60 150 78 240 L0 250 Z" />
      <path d="M400 0 H330 C330 90 340 150 322 240 L400 250 Z" />
    </g>
    <g stroke="#2a2531" strokeWidth="2" fill="none" opacity="0.7">
      <path d="M22 0 C26 80 18 160 30 236 M46 0 C50 90 42 170 56 240" />
      <path d="M378 0 C374 80 382 160 370 236 M354 0 C350 90 358 170 344 240" />
    </g>
    <g fill="#c5a24a">
      <path d="M0 236 L80 226 L80 236 L0 246 Z" />
      <path d="M400 236 L320 226 L320 236 L400 246 Z" />
    </g>
    <g stroke="#d9b95e" strokeWidth="1.5" fill="none">
      <path d="M200 0 v28" />
      <path d="M150 52 Q200 76 250 52" />
      <path d="M200 28 l-50 24 M200 28 l50 24 M200 28 v40" />
    </g>
    <g fill="#f4dfa6">
      <circle cx="150" cy="52" r="4" className="mm-twinkle" />
      <circle cx="200" cy="68" r="4" className="mm-twinkle" style={{ animationDelay: "0.6s" }} />
      <circle cx="250" cy="52" r="4" className="mm-twinkle" style={{ animationDelay: "1.2s" }} />
      {tier !== "facile" ? <circle cx="175" cy="64" r="2.6" className="mm-twinkle" style={{ animationDelay: "0.9s" }} /> : null}
      {tier !== "facile" ? <circle cx="225" cy="64" r="2.6" className="mm-twinkle" style={{ animationDelay: "0.3s" }} /> : null}
    </g>
    <rect x="0" y="246" width="400" height="54" fill="#151219" />
    <path d="M60 300 L110 256 H290 L340 300 Z" fill="#4a3340" />
    <path d="M78 300 L120 264 H280 L322 300 Z" fill="none" stroke="#c5a24a" strokeWidth="1.5" opacity="0.8" />
    {tier === "difficile" ? <path d="M96 300 L130 272 H270 L304 300 Z" fill="none" stroke="#c5a24a" strokeWidth="1" opacity="0.5" /> : null}
  </>
);

const prairie: Scene = ({ tier, uid }) => (
  <>
    <defs>
      <linearGradient id={`${uid}-sky`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#8fc9f0" />
        <stop offset="1" stopColor="#e8f4fb" />
      </linearGradient>
      <linearGradient id={`${uid}-grass`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#8fcf7a" />
        <stop offset="1" stopColor="#4f8f4a" />
      </linearGradient>
    </defs>
    <rect width="400" height="300" fill={`url(#${uid}-sky)`} />
    <circle cx="70" cy="60" r="26" fill="#ffe680" />
    <circle cx="70" cy="60" r="44" fill="#ffe680" opacity="0.25" />
    <g fill="#ffffff" opacity="0.95">
      <g className="mm-float">
        <ellipse cx="250" cy="70" rx="30" ry="12" />
        <ellipse cx="270" cy="62" rx="20" ry="14" />
      </g>
      <g className="mm-float" style={{ animationDelay: "1.4s" }}>
        <ellipse cx="340" cy="110" rx="24" ry="9" />
        <ellipse cx="352" cy="104" rx="14" ry="10" />
      </g>
    </g>
    <path d="M0 214 C90 190 170 222 260 204 C330 190 370 206 400 198 L400 300 L0 300 Z" fill="#6fae63" />
    <path d="M0 244 C120 224 240 262 400 236 L400 300 L0 300 Z" fill={`url(#${uid}-grass)`} />
    <g stroke="#3f7a3c" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.8">
      <path d="M40 276 v-16 M48 278 v-12 M340 272 v-18 M350 276 v-12 M200 284 v-10" />
    </g>
    <g fill="#e34a4a">
      <circle cx="40" cy="258" r="4" />
      <circle cx="340" cy="252" r="4.2" />
      <circle cx="200" cy="272" r="3.4" />
      {tier !== "facile" ? <circle cx="120" cy="250" r="3.6" /> : null}
      {tier === "difficile" ? <circle cx="280" cy="262" r="3.6" /> : null}
    </g>
    <g fill="#2f2320">
      <circle cx="40" cy="258" r="1.2" />
      <circle cx="340" cy="252" r="1.2" />
      <circle cx="200" cy="272" r="1" />
    </g>
  </>
);

const lagon: Scene = ({ tier, uid }) => (
  <>
    <defs>
      <linearGradient id={`${uid}-sky`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#bfeef0" />
        <stop offset="1" stopColor="#eafaf9" />
      </linearGradient>
      <linearGradient id={`${uid}-sea`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#2a9a94" />
        <stop offset="1" stopColor="#5fd6cc" />
      </linearGradient>
    </defs>
    <rect width="400" height="300" fill={`url(#${uid}-sky)`} />
    <circle cx="320" cy="64" r="22" fill="#fff6c8" />
    <rect x="0" y="160" width="400" height="90" fill={`url(#${uid}-sea)`} />
    <g stroke="#ffffff" strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.7">
      <path d="M60 196 q14 -5 28 0 M230 212 q16 -5 32 0 M300 190 q12 -4 24 0" />
    </g>
    <path d="M0 232 C120 222 240 250 400 230 L400 300 L0 300 Z" fill="#f6efe0" />
    <path d="M0 236 C120 226 240 254 400 234 L400 240 C240 260 120 232 0 242 Z" fill="#ffffff" opacity="0.8" />
    <g>
      <path d="M46 250 C40 200 52 150 66 110" stroke="#8c5a3a" strokeWidth="7" fill="none" strokeLinecap="round" />
      <g fill="#3f9a4a" className="mm-float">
        <path d="M66 110 C90 90 120 92 140 104 C112 100 90 106 66 116 Z" />
        <path d="M66 110 C50 86 30 84 12 94 C36 96 52 104 66 118 Z" />
        <path d="M66 110 C80 84 100 74 122 78 C100 86 84 96 68 116 Z" />
        <path d="M66 110 C56 132 60 156 76 170 C68 150 66 130 70 112 Z" />
        <path d="M66 110 C44 122 30 144 32 166 C40 146 52 128 68 114 Z" />
      </g>
      <g fill="#8c5a3a">
        <circle cx="62" cy="116" r="4" />
        <circle cx="70" cy="118" r="4" />
      </g>
    </g>
    <path d="M330 274 l5 -12 l5 12 l12 3 l-9 8 l2 12 l-10 -6 l-10 6 l2 -12 l-9 -8 z" fill="#f0865a" opacity="0.95" />
    {tier !== "facile" ? <ellipse cx="150" cy="280" rx="7" ry="3" fill="#e2d5bd" /> : null}
    {tier === "difficile" ? (
      <g stroke="#1e3138" strokeWidth="1.4" fill="none" strokeLinecap="round" opacity="0.6">
        <path d="M200 50 q5 -5 10 0 q5 -5 10 0 M230 70 q4 -4 8 0 q4 -4 8 0" />
      </g>
    ) : null}
  </>
);

const neige: Scene = ({ tier, uid }) => (
  <>
    <defs>
      <linearGradient id={`${uid}-sky`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#0f1f3a" />
        <stop offset="1" stopColor="#24406a" />
      </linearGradient>
    </defs>
    <rect width="400" height="300" fill={`url(#${uid}-sky)`} />
    {stars(14, 3, 150, "#eef3fa")}
    <circle cx="90" cy="64" r="22" fill="#f6f8fc" opacity="0.9" />
    <circle cx="90" cy="64" r="40" fill="#f6f8fc" opacity="0.08" />
    <path d="M0 236 C120 214 240 250 400 226 L400 300 L0 300 Z" fill="#d8e2ef" />
    <path d="M0 262 C120 246 260 278 400 254 L400 300 L0 300 Z" fill="#eef3fa" />
    <g fill="#24433a">
      <path d="M40 246 l22 -50 l22 50 z M46 222 l16 -34 l16 34 z M50 200 l12 -26 l12 26 z" />
      <path d="M330 242 l24 -56 l24 56 z M336 214 l18 -38 l18 38 z M340 190 l14 -30 l14 30 z" />
      {tier !== "facile" ? <path d="M110 232 l14 -34 l14 34 z M114 214 l10 -22 l10 22 z" /> : null}
      {tier === "difficile" ? <path d="M280 228 l12 -30 l12 30 z M284 212 l8 -18 l8 18 z" /> : null}
    </g>
    <g fill="#eef3fa" opacity="0.9">
      <path d="M50 200 l12 -6 l12 6 l-4 2 l-8 -4 l-8 4 z" />
      <path d="M340 190 l14 -7 l14 7 l-4 2 l-10 -5 l-10 5 z" />
    </g>
    <g fill="#ffffff" opacity="0.9">
      <circle cx="140" cy="100" r="2" className="mm-float" />
      <circle cx="220" cy="140" r="1.6" className="mm-float" style={{ animationDelay: "0.9s" }} />
      <circle cx="300" cy="90" r="2.2" className="mm-float" style={{ animationDelay: "1.5s" }} />
      <circle cx="180" cy="180" r="1.5" className="mm-float" style={{ animationDelay: "0.4s" }} />
      <circle cx="260" cy="200" r="1.8" className="mm-float" style={{ animationDelay: "2s" }} />
    </g>
  </>
);

const savane: Scene = ({ tier, uid }) => (
  <>
    <defs>
      <linearGradient id={`${uid}-sky`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#8a2f3c" />
        <stop offset="0.55" stopColor="#e0603c" />
        <stop offset="1" stopColor="#f2a65a" />
      </linearGradient>
      <linearGradient id={`${uid}-grass`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#c9a24e" />
        <stop offset="1" stopColor="#8f6a3f" />
      </linearGradient>
    </defs>
    <rect width="400" height="300" fill={`url(#${uid}-sky)`} />
    <circle cx="300" cy="196" r="46" fill="#ffd27a" />
    <circle cx="300" cy="196" r="70" fill="#ffd27a" opacity="0.2" />
    <path d="M0 222 C100 210 200 230 400 214 L400 300 L0 300 Z" fill="#7d4a2e" opacity="0.8" />
    <path d="M0 240 C120 226 240 256 400 234 L400 300 L0 300 Z" fill={`url(#${uid}-grass)`} />
    <g fill="#3a2418">
      <path d="M84 240 C86 210 84 190 90 170 C94 190 96 210 96 240 Z" />
      <path d="M90 176 C70 170 40 176 30 168 C60 158 100 150 140 160 C150 166 130 172 90 176 Z" />
      <path d="M92 172 C110 160 150 156 170 166 C150 172 120 176 92 172 Z" />
      {tier !== "facile" ? <path d="M330 244 l3 -20 l3 20 z M320 232 C324 226 340 226 346 232 C334 236 328 236 320 232 Z" /> : null}
    </g>
    <g stroke="#8f6a3f" strokeWidth="1.8" strokeLinecap="round" fill="none" opacity="0.8">
      <path d="M200 280 v-14 M208 282 v-10 M40 272 v-12 M360 268 v-14 M368 272 v-9" />
    </g>
    {tier === "difficile" ? (
      <g stroke="#3a2418" strokeWidth="1.4" fill="none" strokeLinecap="round">
        <path d="M230 80 q5 -5 10 0 q5 -5 10 0 M260 100 q4 -4 8 0 q4 -4 8 0" />
      </g>
    ) : null}
  </>
);

const cerisiers: Scene = ({ tier, uid }) => (
  <>
    <defs>
      <linearGradient id={`${uid}-sky`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#fbeff2" />
        <stop offset="1" stopColor="#f7dce3" />
      </linearGradient>
    </defs>
    <rect width="400" height="300" fill={`url(#${uid}-sky)`} />
    <ellipse cx="200" cy="262" rx="230" ry="44" fill="#bcd7e6" />
    <ellipse cx="200" cy="262" rx="230" ry="44" fill="none" stroke="#ffffff" strokeWidth="1.5" opacity="0.6" />
    <path d="M0 236 C60 226 120 240 180 232 L0 300 Z" fill="#8fbf8a" />
    <path d="M400 236 C340 226 280 240 220 232 L400 300 Z" fill="#8fbf8a" />
    <path d="M0 250 C120 236 260 262 400 246 L400 300 L0 300 Z" fill="#7fb07a" />
    <g stroke="#5a3a3a" strokeWidth="5" strokeLinecap="round" fill="none">
      <path d="M0 100 C40 110 80 120 130 116 M0 100 C30 90 60 84 90 90 M130 116 C150 112 160 120 176 130" />
      <path d="M400 90 C360 106 320 112 280 106 M280 106 C260 104 240 114 226 126 M400 90 C380 80 360 76 340 82" />
    </g>
    <g fill="#f3b6c6">
      <circle cx="60" cy="102" r="14" />
      <circle cx="100" cy="90" r="12" />
      <circle cx="130" cy="114" r="15" />
      <circle cx="170" cy="130" r="11" />
      <circle cx="330" cy="86" r="13" />
      <circle cx="290" cy="106" r="15" />
      <circle cx="240" cy="120" r="12" />
      <circle cx="360" cy="100" r="11" />
    </g>
    <g fill="#e58fa8">
      <circle cx="70" cy="112" r="7" />
      <circle cx="120" cy="100" r="6" />
      <circle cx="300" cy="96" r="7" />
      <circle cx="250" cy="130" r="5" />
      {tier !== "facile" ? <circle cx="160" cy="120" r="6" /> : null}
    </g>
    <g fill="#f3b6c6" opacity="0.9">
      <ellipse cx="150" cy="170" rx="3.5" ry="2" className="mm-float" />
      <ellipse cx="230" cy="190" rx="3" ry="1.8" className="mm-float" style={{ animationDelay: "0.8s" }} />
      <ellipse cx="90" cy="200" rx="3.2" ry="1.8" className="mm-float" style={{ animationDelay: "1.5s" }} />
      <ellipse cx="310" cy="160" rx="3.2" ry="1.8" className="mm-float" style={{ animationDelay: "0.3s" }} />
    </g>
    {tier === "difficile" ? <path d="M180 250 q10 -8 20 0 q-10 4 -20 0 z" fill="#f3b6c6" opacity="0.8" /> : null}
  </>
);

const aurore: Scene = ({ tier, uid }) => (
  <>
    <defs>
      <linearGradient id={`${uid}-sky`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#061226" />
        <stop offset="1" stopColor="#0b2140" />
      </linearGradient>
      <linearGradient id={`${uid}-band`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#4be3a0" stopOpacity="0" />
        <stop offset="0.5" stopColor="#4be3a0" stopOpacity="0.55" />
        <stop offset="1" stopColor="#7be3ff" stopOpacity="0" />
      </linearGradient>
      <linearGradient id={`${uid}-band2`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#b48ae0" stopOpacity="0" />
        <stop offset="0.5" stopColor="#b48ae0" stopOpacity="0.45" />
        <stop offset="1" stopColor="#4be3a0" stopOpacity="0" />
      </linearGradient>
    </defs>
    <rect width="400" height="300" fill={`url(#${uid}-sky)`} />
    {stars(18, 5, 190, "#e6f0ff")}
    <path d="M-20 120 C60 40 140 140 220 60 C300 -10 360 90 420 30 L420 110 C360 170 300 70 220 140 C140 210 60 120 -20 200 Z" fill={`url(#${uid}-band)`} className="mm-float" />
    <path d="M-20 170 C80 100 160 190 240 120 C310 60 360 140 420 90 L420 150 C360 200 310 120 240 180 C160 240 80 160 -20 230 Z" fill={`url(#${uid}-band2)`} className="mm-float" style={{ animationDelay: "1.2s" }} />
    <path d="M0 232 C100 216 200 244 400 226 L400 300 L0 300 Z" fill="#b7cadb" />
    <path d="M0 258 C120 244 260 274 400 252 L400 300 L0 300 Z" fill="#dfe9f2" />
    <g fill="#9fb6c9" opacity="0.7">
      <path d="M40 258 l16 -14 l14 14 z" />
      <path d="M330 252 l20 -18 l16 18 z" />
      {tier !== "facile" ? <path d="M200 246 l12 -10 l10 10 z" /> : null}
    </g>
    {tier === "difficile" ? <circle cx="340" cy="60" r="14" fill="#e6f0ff" opacity="0.7" /> : null}
  </>
);

const orage: Scene = ({ tier, uid }) => (
  <>
    <defs>
      <linearGradient id={`${uid}-sky`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#2b3140" />
        <stop offset="1" stopColor="#6b7280" />
      </linearGradient>
    </defs>
    <rect width="400" height="300" fill={`url(#${uid}-sky)`} />
    <g fill="#4b5563">
      <ellipse cx="90" cy="70" rx="70" ry="28" />
      <ellipse cx="140" cy="56" rx="50" ry="30" />
      <ellipse cx="300" cy="80" rx="80" ry="30" />
      <ellipse cx="250" cy="66" rx="46" ry="26" />
    </g>
    <g fill="#374151">
      <ellipse cx="60" cy="90" rx="60" ry="22" />
      <ellipse cx="330" cy="100" rx="70" ry="24" />
      {tier !== "facile" ? <ellipse cx="200" cy="96" rx="60" ry="20" /> : null}
    </g>
    <path d="M232 92 l-14 34 h12 l-10 32 l30 -42 h-13 l14 -24 z" fill="#fde68a" className="mm-twinkle" style={{ animationDuration: "3.2s" }} />
    <g stroke="#9ca3af" strokeWidth="1.4" strokeLinecap="round" opacity="0.6">
      <path d="M40 130 l-4 14 M70 150 l-4 14 M110 126 l-4 14 M300 140 l-4 14 M340 124 l-4 14 M370 156 l-4 14 M160 170 l-4 14 M270 176 l-4 14" />
    </g>
    <path d="M0 228 C80 206 160 230 240 214 C320 200 360 220 400 210 L400 300 L0 300 Z" fill="#1f2937" />
    <path d="M0 258 C120 240 260 270 400 250 L400 300 L0 300 Z" fill="#111827" />
    {tier === "difficile" ? <path d="M60 258 l-8 -30 l4 2 l-3 -14 l10 22 l-3 -2 z" fill="#111827" opacity="0.9" /> : null}
  </>
);

const volcan: Scene = ({ tier, uid }) => (
  <>
    <defs>
      <linearGradient id={`${uid}-sky`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#1a0b12" />
        <stop offset="1" stopColor="#4a1a26" />
      </linearGradient>
      <radialGradient id={`${uid}-glow`} cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stopColor="#ff8c42" stopOpacity="0.8" />
        <stop offset="1" stopColor="#ff8c42" stopOpacity="0" />
      </radialGradient>
    </defs>
    <rect width="400" height="300" fill={`url(#${uid}-sky)`} />
    {stars(8, 9, 120, "#ffd8b0", false)}
    <ellipse cx="250" cy="150" rx="90" ry="46" fill={`url(#${uid}-glow)`} className="mm-flicker" />
    <path d="M100 240 L226 138 L274 138 L400 240 Z" fill="#2a1a1a" />
    <path d="M226 138 L274 138 L268 150 L232 150 Z" fill="#ff6b35" />
    <g stroke="#ff6b35" strokeWidth="4" strokeLinecap="round" fill="none" className="mm-flicker">
      <path d="M240 148 C236 172 226 190 222 214" />
      <path d="M262 148 C266 170 278 196 288 224" />
      {tier !== "facile" ? <path d="M250 150 C252 180 246 200 250 226" strokeWidth="3" /> : null}
    </g>
    <g stroke="#ffb347" strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.9">
      <path d="M240 148 C236 172 226 190 222 214 M262 148 C266 170 278 196 288 224" />
    </g>
    <g fill="#ffb347">
      <circle cx="220" cy="118" r="2" className="mm-float" />
      <circle cx="270" cy="106" r="1.6" className="mm-float" style={{ animationDelay: "0.7s" }} />
      <circle cx="248" cy="94" r="1.8" className="mm-float" style={{ animationDelay: "1.4s" }} />
      {tier === "difficile" ? <circle cx="290" cy="126" r="1.6" className="mm-float" style={{ animationDelay: "0.3s" }} /> : null}
    </g>
    <path d="M0 236 C100 220 200 246 400 230 L400 300 L0 300 Z" fill="#3a1d20" />
    <path d="M0 262 C120 250 260 278 400 258 L400 300 L0 300 Z" fill="#241416" />
    <g stroke="#ff6b35" strokeWidth="1.2" opacity="0.5" fill="none">
      <path d="M40 274 q20 -4 40 2 M300 270 q24 -6 50 0" />
    </g>
  </>
);

const cite: Scene = ({ tier, uid }) => {
  const heights = [70, 110, 90, 140, 80, 120, 100, 150, 85, 115];
  const windows: ReactNode[] = [];
  heights.forEach((h, i) => {
    const x = i * 40;
    for (let row = 0; row < Math.floor((h - 14) / 16); row++) {
      for (let col = 0; col < 2; col++) {
        const lit = (i * 7 + row * 3 + col) % 4 !== 0;
        if (!lit) continue;
        windows.push(<rect key={`${i}-${row}-${col}`} x={x + 8 + col * 16} y={246 - h + 10 + row * 16} width="8" height="8" fill="#ffd27a" opacity={0.85} className={(i + row) % 5 === 0 ? "mm-twinkle" : undefined} />);
      }
    }
  });
  return (
    <>
      <defs>
        <linearGradient id={`${uid}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#141733" />
          <stop offset="1" stopColor="#4a3f78" />
        </linearGradient>
      </defs>
      <rect width="400" height="300" fill={`url(#${uid}-sky)`} />
      {stars(10, 11, 110, "#f0e6ff")}
      <path d="M330 50 a22 22 0 1 0 22 26 a17 17 0 1 1 -22 -26 z" fill="#f6e7b8" opacity="0.9" />
      <g fill="#1b1d3a">
        {heights.map((h, i) => (
          <rect key={i} x={i * 40} y={246 - h} width="40" height={h + 10} />
        ))}
        {tier !== "facile" ? <rect x="290" y="80" width="6" height="26" /> : null}
      </g>
      <g fill="#0f1024">
        <rect x="120" y="86" width="40" height="8" />
        <rect x="280" y="76" width="40" height="8" />
      </g>
      {windows}
      {tier === "difficile" ? <circle cx="293" cy="78" r="2.4" fill="#ff5c5c" className="mm-twinkle" /> : null}
      <rect x="0" y="246" width="400" height="54" fill="#0f1024" />
      <path d="M0 256 H400" stroke="#2a2d55" strokeWidth="2" />
    </>
  );
};

const galaxie: Scene = ({ tier, uid }) => (
  <>
    <defs>
      <linearGradient id={`${uid}-sky`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#03040d" />
        <stop offset="1" stopColor="#0b1030" />
      </linearGradient>
      <linearGradient id={`${uid}-milk`} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#ffffff" stopOpacity="0" />
        <stop offset="0.5" stopColor="#dfe6ff" stopOpacity="0.28" />
        <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
      </linearGradient>
    </defs>
    <rect width="400" height="300" fill={`url(#${uid}-sky)`} />
    <ellipse cx="200" cy="130" rx="300" ry="46" fill={`url(#${uid}-milk)`} transform="rotate(-18 200 130)" />
    {stars(46, 17, 230, "#ffffff")}
    {stars(12, 23, 200, "#b48ae0", false)}
    <g transform="translate(300 80)">
      <circle r="26" fill="#b48ae0" />
      <path d="M-18 -8 C-8 -18 8 -18 18 -8 C8 -2 -8 -2 -18 -8 Z" fill="#d7c2f0" opacity="0.7" />
      <ellipse rx="42" ry="9" fill="none" stroke="#e8c36a" strokeWidth="3" transform="rotate(-16)" opacity="0.9" />
    </g>
    {tier !== "facile" ? <path d="M60 60 l40 -20" stroke="#ffffff" strokeWidth="1.2" strokeLinecap="round" opacity="0.7" className="mm-twinkle" /> : null}
    {tier === "difficile" ? <path d="M330 170 l30 -12" stroke="#ffffff" strokeWidth="1.2" strokeLinecap="round" opacity="0.7" className="mm-twinkle" style={{ animationDelay: "1.1s" }} /> : null}
    <path d="M0 240 C100 224 200 248 400 232 L400 300 L0 300 Z" fill="#0a0c22" />
    <path d="M0 266 C120 254 260 280 400 260 L400 300 L0 300 Z" fill="#05060f" />
  </>
);

export const SCENES: Record<BackdropId, Scene> = {
  foret,
  sable,
  plage,
  rose,
  velours,
  prairie,
  lagon,
  neige,
  savane,
  cerisiers,
  aurore,
  orage,
  volcan,
  cite,
  galaxie,
};
