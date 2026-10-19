import { Logo, LogoMark } from "@/components/brand/Logo";
import { InviteComposer } from "@/components/invite/InviteComposer";
import { MemberGuests, type GuestLine } from "@/components/invite/MemberGuests";
import { t } from "@/lib/copy";
import { appUrl } from "@/lib/env";
import { capacityInfo, sendBlocker, slotInfo } from "@/lib/invites";
import { memberGuests } from "@/lib/member-guests";
import { currentMember } from "@/lib/members";
import { MAX_GUESTS_PER_BATCH } from "@/lib/schemas";
import { getEvent } from "@/lib/settings";
import { claimMemberPayAction, createMemberInvites, openMemberPayAction, sendMemberDraft, shuffleMemberDraft, signOutMember } from "./actions";

export const dynamic = "force-dynamic";

function greetingKey(): "member.home.greeting_morning" | "member.home.greeting_afternoon" | "member.home.greeting" {
  const h = Number(new Date().toLocaleString("en-GB", { timeZone: "Africa/Lagos", hour: "numeric", hour12: false }));
  return h < 12 ? "member.home.greeting_morning" : h < 17 ? "member.home.greeting_afternoon" : "member.home.greeting";
}

// One page for members: their number, their key (once per phone), and the people they are inviting.
// No event details show until the member is recognised.
export default async function MemberPage() {
  const member = await currentMember();
  const event = member ? await getEvent(member.event_id) : null;
  const slots = member ? await slotInfo(member) : null;
  const blocker = member ? await sendBlocker(member, 1) : null;
  const nearlyFull = member && event ? (await capacityInfo(event)).nearlyFull : false;
  const linkHost = new URL(appUrl()).host;
  const total = slots && !slots.unlimited ? (slots.total as number) : 0;
  const STATUS: Record<string, string> = {
    sent: t("member.status.sent"),
    opened: t("member.status.opened"),
    said_yes: t("member.status.said_yes"),
    awaiting_confirmation: t("member.status.awaiting"),
    paid: t("member.status.paid"),
    expired: t("member.status.expired"),
  };
  const guests: GuestLine[] = member
    ? (await memberGuests(member.id, member.event_id)).map((g) => ({
        id: g.id,
        guest: g.guest,
        status: g.status,
        statusLabel: g.covered && g.status !== "paid" ? t("member.status.covered") : STATUS[g.status] ?? g.status,
        covered: g.covered,
        taps: g.taps,
        paymentLabel: g.payment === "claimed" ? t("member.pay_sheet.claimed_chip") : g.payment === "confirmed" ? t("member.pay_sheet.confirmed_chip") : null,
        canPay: g.canPay,
        asked: g.asked,
      }))
    : [];

  return (
    <main className="shell">
      <div className="bar">
        {member ? (
          <span className="brand">
            <LogoMark size={30} />
            <span>{event?.name}</span>
          </span>
        ) : (
          <Logo size={34} />
        )}
      </div>

      {member && slots ? (
        <>
          <h1 className="display greeting">{t(greetingKey(), { member: member.first_name })}</h1>
          <section className="slots" aria-label={slots.unlimited ? t("member.home.slots_unlimited") : t("member.home.slots_limited", { left: slots.left, total })}>
            {slots.unlimited ? (
              <p className="slot-big">
                <b>∞</b>
                {t("member.home.slots_unlimited")}
              </p>
            ) : (
              <>
                <p className="slot-big" aria-hidden="true">
                  <b>{slots.left}</b>
                  {t("member.home.slots_limited", { left: "", total }).trim()}
                </p>
                <div className="slot-meter" aria-hidden="true">
                  {Array.from({ length: Math.min(total, 30) }, (_, i) => (
                    <i key={i} className={i < slots.used ? "used" : ""} />
                  ))}
                </div>
              </>
            )}
          </section>
        </>
      ) : null}

      <InviteComposer
        identity={member ? { name: member.first_name } : null}
        slots={slots ? { left: slots.unlimited ? null : slots.left, total: slots.total, unlimited: slots.unlimited } : null}
        blocker={blocker}
        nearlyFull={nearlyFull}
        linkHost={linkHost}
        maxRows={MAX_GUESTS_PER_BATCH}
        payMode="member"
        openPayAction={openMemberPayAction}
        claimPayAction={claimMemberPayAction}
        createAction={createMemberInvites}
        shuffleAction={shuffleMemberDraft}
        sendAction={sendMemberDraft}
        signOutAction={signOutMember}
      />
      {member ? <MemberGuests rows={guests} openPayAction={openMemberPayAction} claimPayAction={claimMemberPayAction} /> : null}
    </main>
  );
}
