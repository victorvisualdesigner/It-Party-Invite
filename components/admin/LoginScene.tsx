import type { ReactNode } from "react";
import { Envelope } from "@/components/Envelope";
import { Icon } from "@/components/Icon";
import { Logo } from "@/components/brand/Logo";
import { t } from "@/lib/copy";

// The sign in backdrop shared by the host login and each event's admin login. The card goes in children.
export function LoginScene({ children }: { children: ReactNode }) {
  return (
    <div className="login-scene">
      <span className="login-watermark" aria-hidden="true">
        {t("admin.login.watermark")}
      </span>
      <div className="login-board">
        <section className="login-panel surface-dark bg-club" aria-hidden="true">
          <Logo size={44} />
          <div className="login-panel-art">
            <Envelope mark={t("guest.lock.envelope_mark")} />
          </div>
          <div className="login-panel-copy">
            <h2 className="display">{t("guest.landing.title")}</h2>
            <p>{t("guest.preview_card.og_description")}</p>
          </div>
        </section>
        <section className="login-paper" aria-hidden="true">
          <span className="ring r1" />
          <span className="ring r2" />
          <span className="orbit">
            <i />
          </span>
        </section>
        <div className="login-card-wrap">{children}</div>
        <a className="login-home" href="/">
          <Icon name="back" />
          <span>{t("admin.login.home")}</span>
        </a>
      </div>
    </div>
  );
}
