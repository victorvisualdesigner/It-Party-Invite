// The wax seal, ported from ui/assets/kit.js. One set of gradients lives in <SealDefs />
// (rendered once in the root layout), so every seal on the page can share it.
// Every full seal carries the brand impression: the engraved Y and its spark (lib/brand.ts).

import { BRAND_SPARK, BRAND_Y } from "@/lib/brand";
import { SEAL_D } from "@/lib/seal";

export function SealDefs() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id="oy-seal-a" cx="34%" cy="28%" r="78%">
          <stop offset="0" style={{ stopColor: "var(--wax-light)" }} />
          <stop offset=".55" style={{ stopColor: "var(--seal-600)" }} />
          <stop offset="1" style={{ stopColor: "var(--wax-dark)" }} />
        </radialGradient>
        <radialGradient id="oy-seal-b" cx="62%" cy="68%" r="62%">
          <stop offset="0" style={{ stopColor: "var(--wax-dark)" }} />
          <stop offset="1" style={{ stopColor: "var(--seal-500)" }} />
        </radialGradient>
        <linearGradient id="oy-foil" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: "var(--foil-light)" }} />
          <stop offset=".5" style={{ stopColor: "var(--gold-300)" }} />
          <stop offset="1" style={{ stopColor: "var(--gold-500)" }} />
        </linearGradient>
      </defs>
    </svg>
  );
}

/** The Y and spark pressed into the wax, with a soft shadow under the foil. */
export function SealGlyph({ y = BRAND_Y, spark = BRAND_SPARK }: { y?: string; spark?: string }) {
  return (
    <>
      <g transform="translate(0 1)" fill="rgba(0,0,0,.38)">
        <path d={y} />
        <path d={spark} />
      </g>
      <g fill="url(#oy-foil)">
        <path d={y} />
        <path d={spark} />
      </g>
    </>
  );
}

export function SealSvg({ glyph = false }: { glyph?: boolean }) {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <path d={SEAL_D} transform="translate(0 2.5)" fill="rgba(0,0,0,.35)" />
      <path d={SEAL_D} fill="url(#oy-seal-a)" />
      <circle cx="50" cy="50" r="31" fill="url(#oy-seal-b)" opacity=".9" />
      <circle cx="50" cy="50" r="31" fill="none" stroke="rgba(232,209,147,.45)" strokeWidth="1.1" />
      {glyph ? <SealGlyph /> : <circle cx="50" cy="50" r="26.5" fill="none" stroke="rgba(232,209,147,.22)" strokeWidth=".8" strokeDasharray="1.2 2.6" />}
      <ellipse cx="34" cy="27" rx="13" ry="5.5" fill="rgba(255,255,255,.13)" transform="rotate(-32 34 27)" />
    </svg>
  );
}

/** The full seal with two halves, as it sits on the envelope. */
export function Seal() {
  return (
    <div className="seal">
      <span className="seal-half l">
        <SealSvg glyph />
      </span>
      <span className="seal-half r">
        <SealSvg glyph />
      </span>
      <span className="seal-shine" />
    </div>
  );
}

/** Small seal with a letter, used as avatars and marks. */
export function MiniSeal({ letter, quiet = false }: { letter: string; quiet?: boolean }) {
  return (
    <span className={quiet ? "seal-mini quiet" : "seal-mini"} aria-hidden="true">
      <SealSvg />
      <b>{letter}</b>
    </span>
  );
}
