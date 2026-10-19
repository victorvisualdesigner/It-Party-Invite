import type { Metadata } from "next";
import { PageTop } from "@/components/admin/PageTop";
import { guestRows } from "@/lib/admin-data";
import { requireEventAdmin } from "@/lib/auth";
import { t } from "@/lib/copy";
import { listTeam } from "@/lib/people";
import { ExportPaidButton, GuestsTable } from "./GuestsClient";

export const metadata: Metadata = { title: t("admin.guests.title") };
export const dynamic = "force-dynamic";

export default async function GuestsPage() {
  const admin = await requireEventAdmin();
  const [rows, team] = await Promise.all([guestRows(admin.eventId), listTeam(admin.eventId)]);
  return (
    <>
      <PageTop title={t("admin.guests.title")} subtitle={t("admin.guests.subtitle")} tools={<ExportPaidButton rows={rows.filter((r) => r.status === "paid")} />} />
      <GuestsTable rows={rows} inviters={team.map((p) => ({ id: p.id, name: p.first_name }))} />
    </>
  );
}
