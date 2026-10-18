"use client";

import { useRef, useState } from "react";
import { Envelope } from "@/components/Envelope";

/** The landing envelope: tap it and it knocks, lifts its flap a touch and stays sealed. */
export function SealedEnvelope({ mark, hint, sealed, label }: { mark: string; hint: string; sealed: string; label: string }) {
  const button = useRef<HTMLButtonElement>(null);
  const [line, setLine] = useState(hint);
  const [said, setSaid] = useState(0);

  function knock() {
    const el = button.current;
    if (!el) return;
    el.classList.remove("knock");
    void el.offsetWidth; // restart the animation on every tap
    el.classList.add("knock");
    window.clearTimeout(Number(el.dataset.timer));
    el.dataset.timer = String(window.setTimeout(() => el.classList.remove("knock"), 1000));
    try {
      if (navigator.vibrate) navigator.vibrate(18);
    } catch {}
    setLine(sealed);
    setSaid((n) => n + 1);
  }

  return (
    <>
      <button ref={button} className="landing-env" type="button" aria-label={label} onClick={knock}>
        <span className="float">
          <Envelope mark={mark} glow />
        </span>
        <span className="landing-sparks" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
        </span>
        <span className="shadow" aria-hidden="true" />
      </button>
      <p className={said ? "landing-hint said" : "landing-hint"} key={said} aria-live="polite">
        {line}
      </p>
    </>
  );
}
