import type { Metadata } from "next";
import { PageTop } from "@/components/admin/PageTop";
import { Icon } from "@/components/Icon";
import { requireAdmin } from "@/lib/auth";
import { t } from "@/lib/copy";
import { sweep } from "@/lib/invites";
import { listClaims } from "@/lib/payments";
import { ClaimsList, MatchButton, type ClaimRow } from "./PaymentsClient";

export const metadata: Metadata = { title: t("admin.payments.title") };
export const dynamic = "force-dynamic";

export default async function PaymentsPage() {
  await requireAdmin();
  await sweep();
  const claims = await listClaims();
  const rows: ClaimRow[] = claims.map((c) => ({
    id: c.payment.id,
    guest: c.invite.guest_first_name,
    inviter: c.inviterName,
    payer: c.payment.payer_type === "member" ? t("admin.payments.member_paid", { member: c.inviterName, guest: c.payerName }) : t("admin.payments.paid_by_guest"),
    amount: c.amount,
    reference: c.payment.reference,
    sender: c.payment.sender_name ?? "",
    claimedAt: c.payment.claimed_at ?? c.payment.created_at,
    duplicate: c.duplicate,
  }));
  return (
    <>
      <PageTop title={t("admin.payments.title")} subtitle={t("admin.payments.subtitle")} tools={<MatchButton />} />
      <div className="warning" role="note">
        <Icon name="lock" />
        <div>
          <b>{t("admin.payments.warning")}</b>
        </div>
      </div>
      <ClaimsList rows={rows} />
    </>
  );
}
