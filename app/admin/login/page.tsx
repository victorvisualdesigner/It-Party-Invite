import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginScene } from "@/components/admin/LoginScene";
import { getAdmin } from "@/lib/auth";
import { t } from "@/lib/copy";
import { loginLabels } from "./labels";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: t("admin.login.title") };

// No event details here: anyone with the domain can reach this page.
export default async function LoginPage() {
  if (await getAdmin()) redirect("/admin");
  return (
    <LoginScene>
      <LoginForm labels={loginLabels(t("admin.login.title"), t("admin.login.footnote"))} />
    </LoginScene>
  );
}
