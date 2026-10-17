import type { Metadata } from "next";
import { PageTop } from "@/components/admin/PageTop";
import { doorList } from "@/lib/admin-data";
import { requireAdmin } from "@/lib/auth";
import { t } from "@/lib/copy";
import { DoorScreen } from "./DoorClient";

export const metadata: Metadata = { title: t("admin.door.title") };
export const dynamic = "force-dynamic";

export default async function DoorPage() {
  await requireAdmin();
  return (
    <>
      <PageTop title={t("admin.door.title")} subtitle={t("admin.door.subtitle")} />
      <DoorScreen initial={await doorList()} />
    </>
  );
}
