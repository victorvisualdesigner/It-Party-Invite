import { Logo, LogoMark } from "@/components/brand/Logo";
import { InviteComposer } from "@/components/invite/InviteComposer";
import { t } from "@/lib/copy";
import { appUrl } from "@/lib/env";
import { capacityInfo, sendBlocker, slotInfo } from "@/lib/invites";
import { currentMember } from "@/lib/members";
import { MAX_GUESTS_PER_BATCH } from "@/lib/schemas";
import { getEvent } from "@/lib/settings";
import { createMemberInvites, sendMemberDraft, shuffleMemberDraft, signOutMember } from "./actions";

export const dynamic = "force-dynamic";

function greetingKey(): "member.home.greeting_morning" | "member.home.greeting_afternoon" | "member.home.greeting" {
  const h = Number(new Date().toLocaleString("en-GB", { timeZone: "Africa/Lagos", hour: "numeric", hour12: false }));
  return h < 12 ? "member.home.greeting_morning" : h < 17 ? "member.home.greeting_afternoon" : "member.home.greeting";
}

// One page for members: their number, their key (once per phone), and the people they are inviting.
// No event details show until the member is recognised.
export default async function MemberPage() {
  const member = await currentMember();
  const event = await getEvent();
  const slots = member ? await slotInfo(member) : null;
  const blocker = member ? await sendBlocker(member, 1) : null;
  const nearlyFull = member ? (await capacityInfo(event)).nearlyFull : false;
  const linkHost = new URL(appUrl()).host;
  const total = slots && !slots.unlimited ? (slots.total as number) : 0;

  return (
    <main className="shell">
      <div className="bar">
        {member ? (
          <span className="brand">
            <LogoMark size={30} />
            <span>{event.name}</span>
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
        createAction={createMemberInvites}
        shuffleAction={shuffleMemberDraft}
        sendAction={sendMemberDraft}
        signOutAction={signOutMember}
      />
    </main>
  );
}
