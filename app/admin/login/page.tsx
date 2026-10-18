import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Envelope } from "@/components/Envelope";
import { Icon } from "@/components/Icon";
import { Logo } from "@/components/brand/Logo";
import { getAdmin } from "@/lib/auth";
import { t } from "@/lib/copy";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: t("admin.login.title") };

// No event details here: anyone with the domain can reach this page.
export default async function LoginPage() {
  if (await getAdmin()) redirect("/admin");
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
        <div className="login-card-wrap">
          <LoginForm
            labels={{
              title: t("admin.login.title"),
              email: t("admin.login.email_label"),
              password: t("admin.login.password_label"),
              submit: t("admin.login.submit"),
              submitting: t("admin.login.submitting"),
              network: t("admin.common.error_network"),
              show: t("admin.login.show_password"),
              hide: t("admin.login.hide_password"),
              footnote: t("admin.login.footnote"),
            }}
          />
        </div>
        <a className="login-home" href="/">
          <Icon name="back" />
          <span>{t("admin.login.home")}</span>
        </a>
      </div>
    </div>
  );
}
