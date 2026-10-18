// The sealed envelope, built from layered paper as in ui/assets/kit.js. Static here: it only decorates.
import { Seal } from "@/components/Seal";

export function Envelope({ mark, glow = false }: { mark?: string; glow?: boolean }) {
  return (
    <div className="envelope" aria-hidden="true">
      {glow ? <div className="env-layer env-glow" /> : null}
      <div className="env-layer env-back" />
      <div className="env-layer env-letter">
        <span className="to" />
        <span className="rule" />
        <span className="rule short" />
      </div>
      <div className="env-layer env-front">
        <i className="side-l" />
        <i className="side-r" />
        <i className="bottom" />
        <i className="grain" />
      </div>
      {mark ? <span className="env-mark">{mark}</span> : null}
      <div className="env-layer env-flap-shadow" />
      <div className="env-layer env-flap">
        <i className="out" />
        <i className="in" />
      </div>
      <Seal />
    </div>
  );
}
