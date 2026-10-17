import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Envelope } from "@/components/Envelope";
import { getAdmin } from "@/lib/auth";
import { t } from "@/lib/copy";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: t("admin.login.title") };

// No event details here: anyone with the domain can reach this page.
export default async function LoginPage() {
  if (await getAdmin()) redirect("/admin");
  return (
    <div className="login-wrap">
      <div className="login-art surface-dark bg-club">
        <Envelope mark={t("guest.lock.envelope_mark")} />
        <p>{t("guest.preview_card.og_description")}</p>
      </div>
      <div className="login-form">
        <LoginForm
          labels={{
            title: t("admin.login.title"),
            email: t("admin.login.email_label"),
            password: t("admin.login.password_label"),
            submit: t("admin.login.submit"),
            submitting: t("admin.login.submitting"),
            network: t("admin.common.error_network"),
          }}
        />
      </div>
    </div>
  );
}
