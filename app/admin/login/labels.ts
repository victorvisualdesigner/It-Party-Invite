import { t } from "@/lib/copy";
import type { LoginLabels } from "./LoginForm";

/** The sign in card's words. Built on the server so the copy file stays off the client. */
export function loginLabels(title: string, footnote: string): LoginLabels {
  return {
    title,
    email: t("admin.login.email_label"),
    password: t("admin.login.password_label"),
    submit: t("admin.login.submit"),
    submitting: t("admin.login.submitting"),
    network: t("admin.common.error_network"),
    show: t("admin.login.show_password"),
    hide: t("admin.login.hide_password"),
    footnote,
  };
}
