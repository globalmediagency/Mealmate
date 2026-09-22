/**
 * A pen-drawing look-alike for the dev screens and the tests (spec § 3.19):
 * black strokes on a white sheet, asymmetric so the orientation is
 * unambiguous, with enough corners for the photo-marker tracker.
 */
export const DEV_DOODLE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
<rect width="512" height="512" fill="#fbf8f1"/>
<g fill="none" stroke="#1a1a1a" stroke-width="9" stroke-linecap="round" stroke-linejoin="round">
<path d="M70 300 L70 190 L150 120 L230 190 L230 300 Z"/>
<path d="M120 300 L120 240 L180 240 L180 300"/>
<path d="M90 210 h40 v35 h-40 Z"/>
<circle cx="380" cy="120" r="46"/>
<path d="M380 40 v20 M380 180 v20 M300 120 h20 M440 120 h20 M324 64 l14 14 M422 162 l14 14 M436 64 l-14 14 M338 162 l-14 14"/>
<path d="M60 400 l40 -50 l40 50 l40 -50 l40 50 l40 -50 l40 50 l40 -50 l40 50 l40 -50"/>
<path d="M290 260 l60 -10 l30 40 l-70 30 Z"/>
<path d="M400 250 l40 20 l-20 40 l-40 -20 Z"/>
<path d="M60 460 h390"/>
<path d="M290 330 l30 30 M320 330 l-30 30 M350 335 l25 25 M375 335 l-25 25"/>
</g>
<g fill="#1a1a1a">
<circle cx="150" cy="145" r="9"/><rect x="255" y="190" width="24" height="24"/><rect x="255" y="240" width="24" height="24" transform="rotate(30 267 252)"/>
<circle cx="430" cy="380" r="14"/><rect x="380" y="400" width="30" height="30"/><rect x="330" y="420" width="18" height="18"/>
</g>
</svg>`;

/** The doodle as a data URL, usable as a `MarkerReference` (the camera fetches it like an uploaded picture). */
export const DEV_DOODLE_URL = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(DEV_DOODLE_SVG)}`;
