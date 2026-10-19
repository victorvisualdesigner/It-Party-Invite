import type { Metadata } from "next";
import { PageTop } from "@/components/admin/PageTop";
import { InviteComposer } from "@/components/invite/InviteComposer";
import { requireAdmin } from "@/lib/auth";
import { t } from "@/lib/copy";
import { appUrl } from "@/lib/env";
import { capacityInfo, sendBlocker } from "@/lib/invites";
import { MAX_GUESTS_PER_BATCH } from "@/lib/schemas";
import { getEvent } from "@/lib/settings";
import { createAdminInvites, sendAdminDraft, shuffleAdminDraft } from "./actions";
import "../../../composer.css";

export const metadata: Metadata = { title: t("admin.nav.invite") };

export default async function InvitePage() {
  const admin = await requireAdmin();
  const event = await getEvent();
  const inviter = { id: admin.id, role: admin.role, first_name: admin.first_name, slot_limit: null };
  return (
    <>
      <PageTop title={t("admin.nav.invite")} subtitle={t("admin.invite.subtitle")} />
      <section className="card card-pad composer-wrap">
        <InviteComposer
          identity={{ name: admin.first_name }}
          slots={{ left: null, total: null, unlimited: true }}
          blocker={await sendBlocker(inviter, 1)}
          nearlyFull={(await capacityInfo(event)).nearlyFull}
          linkHost={new URL(appUrl()).host}
          maxRows={MAX_GUESTS_PER_BATCH}
          payMode="host"
          createAction={createAdminInvites}
          shuffleAction={shuffleAdminDraft}
          sendAction={sendAdminDraft}
        />
      </section>
    </>
  );
}
