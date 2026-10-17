import type { Metadata } from "next";
import { PageTop } from "@/components/admin/PageTop";
import { requireAdmin } from "@/lib/auth";
import { t } from "@/lib/copy";
import { listTeam } from "@/lib/people";
import { localPhone } from "@/lib/phone";
import { AddMemberButton, MembersTable, type MemberRow } from "./MembersClient";

export const metadata: Metadata = { title: t("admin.members.title") };

export default async function MembersPage() {
  await requireAdmin();
  const team = await listTeam();
  const rows: MemberRow[] = team.map((p) => ({
    id: p.id,
    role: p.role,
    firstName: p.first_name,
    phone: localPhone(p.phone_e164),
    slotLimit: p.slot_limit,
    used: p.used,
    paid: p.paid,
  }));
  return (
    <>
      <PageTop title={t("admin.members.title")} subtitle={t("admin.members.subtitle")} tools={<AddMemberButton />} />
      <MembersTable rows={rows} />
    </>
  );
}
