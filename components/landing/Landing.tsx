import { t } from "@/lib/copy";
import { SealedEnvelope } from "./SealedEnvelope";
import "./landing.css";

/** The front door, at the root address and on any unknown path. Never any event details. */
export function Landing() {
  return (
    <main className="landing surface-dark bg-club">
      <div className="landing-glow" aria-hidden="true" />
      <div className="landing-rays" aria-hidden="true" />
      <div className="landing-dust" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
        <i />
        <i />
        <i />
        <i />
      </div>
      <section className="landing-stage">
        <p className="eyebrow">{t("guest.lock.eyebrow")}</p>
        <SealedEnvelope
          mark={t("guest.lock.envelope_mark")}
          hint={t("guest.landing.hint")}
          sealed={t("guest.landing.sealed")}
          label={t("guest.landing.hint")}
        />
        <h1 className="display">{t("guest.landing.title")}</h1>
        <p className="lede">{t("guest.landing.body")}</p>
      </section>
      <a className="landing-host" href="/admin/login">
        {t("guest.landing.host")}
      </a>
    </main>
  );
}
