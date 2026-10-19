import type { Metadata } from "next";
import { Logo } from "@/components/brand/Logo";
import { setupTarget } from "@/lib/admins";
import { t } from "@/lib/copy";
import { SetupForm } from "./SetupForm";

export const metadata: Metadata = { title: t("admin.setup.title") };

// A new admin's one time link. No session needed; the token itself is the proof, and it works once.
export default async function SetupPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const target = await setupTarget(token);
  return (
    <main className="setup-scene">
      <Logo size={40} tone="dark" />
      <section className="login-card setup-card">
        {target ? (
          <>
            <h1 className="login-title">{t("admin.setup.title")}</h1>
            <p className="setup-body">{t("admin.setup.body", { admin: target.firstName, email: target.email })}</p>
            <SetupForm
              token={token}
              email={target.email}
              labels={{
                password: t("admin.setup.password_label"),
                again: t("admin.setup.again_label"),
                help: t("admin.setup.help"),
                submit: t("admin.setup.submit"),
                submitting: t("admin.setup.submitting"),
                show: t("admin.login.show_password"),
                hide: t("admin.login.hide_password"),
                network: t("admin.common.error_network"),
              }}
            />
          </>
        ) : (
          <>
            <h1 className="login-title">{t("admin.setup.expired_title")}</h1>
            <p className="setup-body">{t("admin.setup.expired_body")}</p>
          </>
        )}
      </section>
    </main>
  );
}
