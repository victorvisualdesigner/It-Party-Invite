import type { Metadata } from "next";
import { PageTop } from "@/components/admin/PageTop";
import { listAdmins } from "@/lib/admins";
import { requireSuperadmin } from "@/lib/auth";
import { t } from "@/lib/copy";
import { localPhone } from "@/lib/phone";
import { AddAdminButton, AdminsList } from "./AdminsClient";

export const metadata: Metadata = { title: t("admin.admins.title") };

export default async function AdminsPage() {
  const me = await requireSuperadmin();
  const admins = (await listAdmins()).map((a) => ({ ...a, phone: localPhone(a.phone), me: a.id === me.id }));
  return (
    <>
      <PageTop title={t("admin.admins.title")} subtitle={t("admin.admins.subtitle")} tools={<AddAdminButton />} />
      <AdminsList rows={admins} />
    </>
  );
}
