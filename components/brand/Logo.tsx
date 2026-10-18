// The Only Yes logo. The mark is the brand seal; the lockup adds the outlined wordmark and,
// where there is room, the line under it. Gradients come from <SealDefs /> in the root layout.
import type { CSSProperties } from "react";
import { SealGlyph } from "@/components/Seal";
import { BRAND_NAME, BRAND_SPARK_SMALL, BRAND_Y_SMALL, TAGLINE, WORDMARK } from "@/lib/brand";
import { SEAL_D } from "@/lib/seal";

/** The seal on its own. Below 48px it switches to the heavier cut so the hairline does not vanish. */
export function LogoMark({ size = 40, label }: { size?: number; label?: string }) {
  const small = size < 48;
  return (
    <svg
      className="logo-mark"
      viewBox="0 0 100 100"
      width={size}
      height={size}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <path d={SEAL_D} transform="translate(0 2.5)" fill="rgba(0,0,0,.35)" />
      <path d={SEAL_D} fill="url(#oy-seal-a)" />
      <circle cx="50" cy="50" r="31" fill="url(#oy-seal-b)" opacity=".9" />
      {small ? (
        <SealGlyph y={BRAND_Y_SMALL} spark={BRAND_SPARK_SMALL} />
      ) : (
        <>
          <circle cx="50" cy="50" r="31" fill="none" stroke="rgba(232,209,147,.45)" strokeWidth="1.1" />
          <SealGlyph />
        </>
      )}
      <ellipse cx="34" cy="27" rx="13" ry="5.5" fill="rgba(255,255,255,.13)" transform="rotate(-32 34 27)" />
    </svg>
  );
}

/** "ONLY YES", outlined. Takes its colour from the text colour around it. */
export function Wordmark({ className = "logo-word" }: { className?: string }) {
  return (
    <svg className={className} viewBox={`0 -770 ${WORDMARK.width} 790`} style={{ aspectRatio: `${WORDMARK.width} / 790` }} aria-hidden="true" focusable="false">
      <path d={WORDMARK.d} fill="currentColor" />
    </svg>
  );
}

/**
 * Mark plus wordmark. `size` is the mark's height in pixels; the type scales from it.
 * `tone` "light" sits on green, "dark" on cream. `tagline` adds "By invitation only" under the name.
 */
export function Logo({
  size = 40,
  tone = "light",
  tagline = false,
  stacked = false,
  className = "",
}: {
  size?: number;
  tone?: "light" | "dark";
  tagline?: boolean;
  stacked?: boolean;
  className?: string;
}) {
  const style = { "--logo-s": `${size}px` } as CSSProperties;
  return (
    <span className={`logo logo-${tone}${stacked ? " logo-stacked" : ""} ${className}`.trim()} style={style} role="img" aria-label={BRAND_NAME}>
      <LogoMark size={size} />
      <span className="logo-type">
        <Wordmark />
        {tagline ? (
          <svg className="logo-tag" viewBox={`0 -1430 ${TAGLINE.width} 1460`} style={{ aspectRatio: `${TAGLINE.width} / 1460` }} aria-hidden="true" focusable="false">
            <path d={TAGLINE.d} fill="currentColor" />
          </svg>
        ) : null}
      </span>
    </span>
  );
}
